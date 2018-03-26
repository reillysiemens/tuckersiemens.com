+++
title = "Announcing Layabout"
description = "Announcing Layabout, an event handler for the Slack RTM API."
date = "2018-02-18T01:36:00-08:00"
tags = ["Slack", "Python", "Layabout"]
+++
# Event Handling for the Slack RTM API

Today I'm publishing [Layabout], my first official Python library, to [PyPI].
Layabout is a small event handling library on top of the
[Slack Real Time Messaging (RTM) API][Slack RTM API]. If you want to grab it
off the shelf and start playing with it as you read this blog post you can
install it by running

```bash
pip install layabout
```

in your terminal of choice. Once you've got Layabout installed let's take a
look at what it's capable of by borrowing the code example right from its
`README.rst`.


```python
from pprint import pprint
from layabout import Layabout

layabout = Layabout('app')


@layabout.handle('*')
def debug(slack, event):
    """ Pretty print every event seen by the app. """
    pprint(event)


@layabout.handle('message')
def echo(slack, event):
    """ Echo all messages seen by the app except our own. """
    if event.get('subtype') != 'bot_message':
        slack.rtm_send_message(event['channel'], event['text'])


def someone_leaves(events):
    """ Return False if a member leaves, otherwise True. """
    return not any(e.get('type') == 'member_left_channel' for e in events)

if __name__ == '__main__':
    layabout.run(until=someone_leaves)
    print("Don't talk to me or my handlers ever again!")
```

In 25 lines of code we've used Layabout to do the following:
- Register a `debug` handler that triggers on **all** RTM events to pretty
  print them.
- Register an `echo` handler that triggers on `message` events to echo them
  back into the channel they came from (unless of course we generated them).
- Load our application token from an environment variable (`SLACK_API_TOKEN`
  by default).
- Connect to the Slack API.
- Continuously listen for events, calling the appropriate handlers until
  `someone_leaves` a channel we have access to.

# Why?

Why Layabout when the [Slack Events API] exists and there's already an
officially supported [events library]?

Simply put, if you don't want to run a web server so Slack can call you when
events happen, then Layabout is for you.

Most [events] are supported by the [RTM API][Slack RTM API] as well and
Layabout enables you to start handling events quickly without worrying about
setting up Flask, configuring a reverse proxy, acquiring an SSL certificate,
and the myriad other tasks that come with hosting a web app.

That said, if you can't afford to have a persistent WebSocket connection to the
Slack API, then you probably _do_ want the official events library.

# Design

If you're familiar with the superb [Flask] library then Layabout probably looks
eerily similar to you. That's no accident and hopefully [Armin Ronacher] thinks
imitation is the sincerest form of flattery.

More concretely, I think Python decorators are a powerful combination of
simplicity and flexibility. They also lend themselves particularly well to
event-driven workflows.

The heart of Layabout is its aggressively simple `Layabout.handle` method. Its 
normal invocation just guarantees the decorated function will accept a
`SlackClient` and an event as arguments before registering it as a particular
type of handler.

Having access to those two arguments alone opens up a wealth of possibilities.
To maximize developer freedom I wanted to provide as thin a wrapper as I could
on top of the already excellent [slackclient] library. Giving direct access to
a `SlackClient` instance meant I didn't have to write my own functions for
calling out to the RTM API and I could also take advantage of its ability to
call the [Slack Web API] as well.

I also took inspiration from [pytest]'s `pytest.mark.parametrize` decorator to
give handlers more versatility by adding an extra `kwargs` parameter.

```python
from layabout import Layabout

layabout = Layabout('app')

if __name__ == '__main__':
    foo = input('Please input a foo: ')

    @layabout.handle('hello', kwargs={'foo': foo})
    def hello(slack, event, foo):
        print(f"Hello! My foo is {foo}.")
```

By adding a `kwargs` parameter we can not only use `Layabout.handle` as a
decorator, but also to register functions at runtime with dynamic data. For
example, this code logs events that happen, but only if they're in particular
channels:

```python
from layabout import Layabout

layabout = Layabout('app')


def log_for_channels(slack, event, channels):
    if event['channel'] in channels:
        print(f"{event['type']} happened in {event['channel']}!")


if __name__ == '__main__':
    event_channels = (
        ('star_added', ('G1A8FG8AE', 'C03QZSL29')),
        ('star_removed' ('C47CSFJRK', 'C045BMR29', 'G13RTMGXY')),
    )
    for event, channels in event_channels:
        layabout.handle(event, kwargs={'channels': channels})(log_for_channels)
```

You could also use a closure or default arguments on a normal function
definition for this and it might look a little cleaner, but for passing runtime
data to a lot of functions those can be tedious options.

Ultimately, I tried to write a library that I would want to use. I'm more
excited now than ever to work with Slack's APIs, so in that regard I think this
library is already a success.

# Implementation

One of the hallmarks of this library is that it only supports Python 3.6+. I
specifically chose to use only the most recent Python for three reasons:
1. I wanted take advantage of all the new language features like type
   annotations, f-strings, better destructuring assignment, etc.
2. I didn't want to limit myself to the least common denominator by worrying
   about backwards compatibility.
3. [2020] is fast approaching, folks. Use Python 3 already.

I normally try to drink as little of the Object Oriented Kool-Aid as possible,
so I tried a functional approach first, but keeping track of what was going on
with connection state with a class just made sense to me. It also ended up
being cleaner to keep a handler registry on an instance. Since they're
self-contained you could conceivably spawn multiple instances into their own
threads/processes and run them all simultaneously if you're careful with your
global mutable state.

## Async

- Unfortunately couldn't use `async def` because of `slackclient`.

## Type Annotations

The best part about this entire project so far has been learning how to use
Python 3 type annotations. Type annotations are **awesome**! Go use them!

- Type annotations.
  - Annoyance with `Callable`.

```python
# Sadly, this doesn't work.
Handler = Callable[[SlackClient, Dict[str, Any], ...], Any]
```

## Run Method

As a final note, the `Layabout.run` method only has an `until` parameter
because it made it **so** much easier for me to unit test. If you go read the
tests you'll notice most of them get called with

```python
layabout.run(until=lambda e: False)
```

which saves me from the headache of trying to test an otherwise infinite loop.
If `until` is `None` then `Layabout.run` just uses its own private function

```python
def _forever(events: List[Dict[str, Any]]) -> bool:  # pragma: no cover
    """ Run Layabout in an infinite loop. """
    return True
```

Giving the looping conditional access to the events opened up enough
possibilities that I decided to keep it as part of the design.

# What's Next?

If you're still here and Layabout sounds like fun to you then check out these
links to get started.
- 📜 [Documentation]
- 🐛 [Bug Reports / Issues]
- 💾 [Source Code]

I _happily_ accept pull requests, so if something's not quite right feel free
to jump in and submit your own fix if you're able. Happy Slacking!

[Layabout]: https://github.com/reillysiemens/layabout
[PyPI]: https://pypi.python.org/pypi
[Slack RTM API]: https://api.slack.com/rtm
[Slack Events API]: https://api.slack.com/events-api
[events library]: https://github.com/slackapi/python-slack-events-api
[events]: https://api.slack.com/events
[Flask]: http://flask.pocoo.org/
[slackclient]: https://github.com/slackapi/python-slackclient
[Slack Web API]: https://api.slack.com/web
[pytest]: https://docs.pytest.org/en/latest/
[Armin Ronacher]: http://lucumr.pocoo.org/about/
[2020]: https://www.python.org/dev/peps/pep-0373/#id2
[Documentation]: https://layabout.readthedocs.io/en/latest.html
[Bug Reports / Issues]: https://github.com/reillysiemens/layabout/issues
[Source Code]: https://github.com/reillysiemens/
