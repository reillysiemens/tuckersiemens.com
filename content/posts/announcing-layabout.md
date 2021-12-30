+++
title = "Announcing Layabout"
description = "Announcing Layabout, an event handler for the Slack RTM API."
date = 2018-06-30T00:16:52-07:00
[taxonomies]
tags = ["Slack", "Python", "Layabout"]
+++

Today I'm announcing [Layabout], my first official Python library. Layabout is
a small event handling library on top of the
[Slack Real Time Messaging (RTM) API][Slack RTM API]. You can get it right now
on [PyPI].

<!-- more -->

## What's It Good For?

You can think of Layabout as a micro framework for building Slack bots. Since
it wraps Slack’s RTM API it does best with tasks like interacting with users,
responding to channel messages, and monitoring events. If you want more ideas
on what you can do with it keep reading or check out the [examples].

## Why?

Why choose Layabout when the [Slack Events API] exists and there's already an
officially supported [events library]? If these points resonate with you then
Layabout is for you.

- You don't want set up Flask or a similar framework.
- You don't want to configure a reverse proxy.
- You don't want to acquire an SSL certificate.
- You don't want to do any of the myriad tasks associated with best practices
  in hosting a web app just to respond to Slack events.
- You're satisfied with the large set of [events] supported by the
  [RTM API][Slack RTM API].

## Why Not?

Layabout won't be for everone and that's OK. If these points resonate with you
then you probably _do_ want to use the official events library.

- You can't afford to have a persistent WebSocket connection in your
  application.

## A Practical Example

If you want to download it and start playing with it as you read the rest of
this blog post you can install it by running

```bash
pip install layabout
```

Once you've got Layabout installed let's take a look at what it's capable of by
borrowing the code example right from its
`README.rst`.


```python
from pprint import pprint
from layabout import Layabout

app = Layabout()


@app.handle('*')
def debug(slack, event):
    """ Pretty print every event seen by the app. """
    pprint(event)


@app.handle('message')
def echo(slack, event):
    """ Echo all messages seen by the app except our own. """
    if event.get('subtype') != 'bot_message':
        slack.rtm_send_message(event['channel'], event['text'])


def someone_leaves(events):
    """ Return False if a member leaves, otherwise True. """
    return not any(e.get('type') == 'member_left_channel'
                   for e in events)


if __name__ == '__main__':
    # Automatically load app token from $LAYABOUT_TOKEN and run!
    app.run(until=someone_leaves)
    print("Looks like someone left a channel!")
```

In 28 lines of code we've used Layabout to do the following:
- Register a `debug` handler that triggers on **all** RTM events to pretty
  print them.
- Register an `echo` handler that triggers on `message` events to echo them
  back into the channel they came from (unless of course we generated them).
- Load our application token from an environment variable (`$LAYABOUT_TOKEN` by
  default).
- Connect to the Slack API.
- Continuously listen for events, calling the appropriate handlers until
  `someone_leaves` a channel we have access to.

Now that we've looked at what Layabout is, why you might want to use it, and
how to use it let's look a bit deeper into its design and implementation.

## Design

If you're familiar with the superb [Flask] library then Layabout probably looks
eerily similar to you. That's no accident and hopefully [Armin Ronacher] thinks
imitation is the sincerest form of flattery.

More concretely, I think Python decorators are a powerful combination of
simplicity and flexibility. They also lend themselves particularly well to
event-driven workflows.

The heart of Layabout is its aggressively simple
[`Layabout.handle`][layabout-handle] method. Its normal invocation just
guarantees the decorated function will accept a `SlackClient` and an event as
arguments before registering it as a particular
type of handler.

Having access to those two arguments alone opens up a wealth of possibilities.
To maximize developer freedom I wanted to provide as thin a wrapper as I could
on top of the already excellent [slackclient] library. Giving direct access to
a `SlackClient` instance meant I didn't have to write my own functions for
calling out to the RTM API and I could also take advantage of its ability to
call the [Slack Web API] as well.

I also took inspiration from [pytest]'s
[`pytest.mark.parametrize`][pytest-parametrize] decorator to give handlers more
versatility by adding an extra `kwargs` parameter.

```python
from layabout import Layabout

app = Layabout()

if __name__ == '__main__':
    name = input('What is your name? ')

    @app.handle('hello', kwargs={'name': name})
    def hello(slack, event, name):
        print(f"Hello! My name is {name}.")

    app.run()  # Run forever.
```

By adding a `kwargs` parameter we can not only use `Layabout.handle` as a
decorator, but also to register functions at runtime with dynamic data. For
example, this code logs events that happen, but only if they're in particular
channels:

```python
from layabout import Layabout

app = Layabout()


def log_for_channels(slack, event, channels):
    """ Log the event if it happened in a channel we care about. """
    if event['channel'] in channels:
        print(f"{event['type']} happened in {event['channel']}!")


if __name__ == '__main__':
    # A mapping of events to their respective channels.
    event_channels = (
        ('star_added', ('G1A8FG8AE', 'C03QZSL29')),
        ('star_removed' ('C47CSFJRK', 'C045BMR29', 'G13RTMGXY')),
    )

    # For each event register a new handler for specific channels.
    for event, channels in event_channels:
        app.handle(event, kwargs={'channels': channels})(log_for_channels)

    app.run()  # Run forever.
```

You could also use a [closure] or default arguments on a normal function
definition for this and it might look a little cleaner, but for passing runtime
data to a lot of functions those can be tedious options.

Ultimately, I tried to write a library that I would want to use. I'm more
excited now than ever to work with Slack's APIs, so in that regard I think this
library is already a success.

## Implementation

One of the hallmarks of this library is that it only supports Python 3.6+. I
specifically chose to use only the most recent Python for three reasons:
1. I wanted take advantage of all the new language features like type
   annotations, f-strings, better destructuring assignment, etc.
2. I didn't want to limit myself to the least common denominator by worrying
   about backwards compatibility.
3. [2020] is fast approaching, folks. Use Python 3 already. If you intend to
   keep Python as part of your stack you're rapidly running out of excuses not
   to modernize.

I normally try to drink as little of the Object Oriented Kool-Aid as possible,
so I tried a functional approach first, but keeping track of what was going on
with connection state with a class just made sense to me. It also ended up
being cleaner to keep a handler registry on an instance. Since they're
self-contained you could conceivably spawn multiple instances into their own
threads/processes and run them all simultaneously if you're careful with your
global mutable state.

### Async

Unfortunately I didn't see an easy way to use Python 3's
[`async def`][async-def] because of the synchronous nature of `slackclient`'s
`SlackClient.rtm_read` method. This is a Python 3 feature I'd really like to
learn more about and event handling and async seem like a natural fit to me. If
there's ever a reason to release a Layabout v2.0 I will probably push harder in
this direction.

### Type Annotations

From a development stance, the best part about this entire project so far has
been learning how to use Python 3 [type annotations]. I miss
them whenever I'm working with a project that doesn't have them.

I did have one minor annoyance while working with type annotations. Layabout
keeps an internal collection of all the event handlers that have been
registered to it with this signature.

```python
# Private type alias for the complex type of the handlers defaultdict.
_Handlers = DefaultDict[str, List[Tuple[Callable, dict]]]
```

I wanted to be even more restrictive and specify exactly what was required
of the [`Callable`][callable] by defining a [type alias] for a `Handler`. The
restrictions I sought to specify were:
- A handler must take at least two positional arguments:
  - The first argument must be a `SlackClient`.
  - The second argument must be a dictionary of arbitrary types keyed by string
    (`Dict[str, Any]`) as that's what the Slack RTM API events are.
- If the required arguments are satisfied a handler _may_ take any number of
  additional arguments of `Any` type.
- A handler can return `Any` type.

I took a stab at expressing this as

```python
Handler = Callable[[SlackClient, Dict[str, Any], ...], Any]
```

Sadly, it would seem this doesn't work. Right now [mypy] complains with a

```
error: Unexpected '...'
```

I've been up and down the [Python typing project][python-typing], but even
after visiting [issue #193][issue-193] and [issue #264][issue-264] can't find a
simple syntax for expressing a function that has a minimum arity of two with
required types, but is [variadic] thereafter and [generic] in the types it
accepts.

There may, in fact, be a way to express this type with current annotations, but
I haven't figured out what it is yet. It may also be the case that the
difficulty in expressing this type is an indicator that a better API exists and
should be preferred. For now I've settled on just declaring that a `Handler` is
a `Callable`. I've got an auxiliary function that validates handlers to let
users know if they've omitted a required positional argument.

Despite that small inconvenience type annotations are **awesome**! Go use them!
I now firmly believe that supplemental static analysis makes for better
software, even in dynamically typed languages.

### Run Method

As a final note on implementation, the [`Layabout.run`][layabout-run] method
only has an `until` parameter because it made it **so** much easier for me to
unit test. If you go read the [tests] you'll notice many of them get called with

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

## Thanks

I want to extend a special thank you to [Alex LordThorsen], [Geoff Shannon],
[Kyle Rader], and [Mike Canoy] for their help during the initial development of
this library. In particular the feedback I got on [PR #2][pr-2] was incredible
and radically changed the library for the better.

## What's Next?

If you're still here and Layabout sounds like fun to you then check out these
links to get started.
- 📜 [Documentation]
- 🐛 [Bug Reports / Issues]
- 💾 [Source Code]

I _happily_ entertain pull requests, so if something's not quite right feel
free to jump in and submit your own fix if you're able. Happy Slacking!

[Layabout]: https://layabout.readthedocs.io/en/latest/
[PyPI]: https://pypi.org/project/layabout
[Slack RTM API]: https://api.slack.com/rtm
[examples]: https://github.com/reillysiemens/layabout/tree/master/examples
[Slack Events API]: https://api.slack.com/events-api
[events library]: https://github.com/slackapi/python-slack-events-api
[events]: https://api.slack.com/events
[Flask]: http://flask.pocoo.org/
[layabout-handle]: https://layabout.readthedocs.io/en/latest/api.html#layabout.Layabout.handle
[closure]: https://en.wikipedia.org/wiki/Closure_(computer_programming)
[slackclient]: https://github.com/slackapi/python-slackclient
[Slack Web API]: https://api.slack.com/web
[pytest]: https://docs.pytest.org/en/latest/
[pytest-parametrize]: https://docs.pytest.org/en/latest/how-to/parametrize.html
[Armin Ronacher]: http://lucumr.pocoo.org/about/
[2020]: https://www.python.org/dev/peps/pep-0373/#update-april-2014
[async-def]: https://docs.python.org/3/reference/compound_stmts.html#async-def
[type annotations]: https://www.python.org/dev/peps/pep-0484/
[type alias]: https://docs.python.org/3/library/typing.html#type-aliases
[mypy]: https://github.com/python/mypy
[python-typing]: https://github.com/python/typing
[issue-193]: https://github.com/python/typing/issues/193
[issue-264]: https://github.com/python/typing/issues/264
[variadic]: https://en.wikipedia.org/wiki/Variadic_function
[generic]: https://en.wikipedia.org/wiki/Generic_programming
[callable]: https://docs.python.org/3/library/typing.html#callable
[layabout-run]: https://layabout.readthedocs.io/en/latest/api.html#layabout.Layabout.run
[tests]: https://github.com/reillysiemens/layabout/blob/ed617cdfec4ec31b681f51697f922d4979f83cb6/tests/test_layabout.py
[Alex LordThorsen]: https://github.com/rawrgulmuffins
[Geoff Shannon]: https://github.com/RadicalZephyr
[Kyle Rader]: https://github.com/kyle-rader
[Mike Canoy]: https://mikecanoy.net
[pr-2]: https://github.com/reillysiemens/layabout/pull/2
[Documentation]: https://layabout.readthedocs.io/en/latest/
[Bug Reports / Issues]: https://github.com/reillysiemens/layabout/issues
[Source Code]: https://github.com/reillysiemens/layabout/
