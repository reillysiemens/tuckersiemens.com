+++
title = "Deprecating Layabout"
description = "Deprecating Layabout"
date = 2019-12-31T17:29:00-08:00
[taxonomies]
tags = ["Slack", "Python", "Layabout"]
+++
Since [Layabout] launched last year it has been downloaded 5,755 times, gotten
16 stars on GitHub, been used by a Portuguese startup to teach a
[Haskell workshop], and received a [Twitter shout-out] from [@roach], one of
the core contributors to the [official Python Slack client]. During that time the
official client library also got a **lot** better! So much better, in fact,
that I've decided to deprecate Layabout.

<!-- more -->

## When?

Layabout is officially deprecated on **January 1st, 2020** along with Python 2
(_finally_ 😉). I'll be rolling out documentation changes and adding
deprecation warnings in a final release within the next week or so. Technically
Layabout will continue to function as long as the API interface supported by
the 1.0 Slack library is supported, but you should transition off of it as soon
as you are able. I recommend using the 2.0 Slack library instead.

## Why?

In May, [Rodney Urquhart] and contributors [rewrote the slackclient library]
from the ground up in a way that closely matched some of the design decisions I
made when creating Layabout. When I [announced Layabout] I included a quick
example of using the framework to build an echo client that would repeat all
messages in a given channel. To understand why Layabout no longer provides
substantial benefit, let's compare that example written with Layabout to the
same application using the 2.0 Slack client.

```python
""" An echo client written using Layabout. """
from layabout import Layabout

app = Layabout()


@app.handle("message")
def echo(slack: "slackclient.SlackClient", event: dict) -> None:
    """ Echo all messages seen by the app except our own. """
    if event.get("subtype") != "bot_message":
        slack.rtm_send_message(event["channel"], event["text"])


if __name__ == "__main__":
    app.run()
```

```python
""" An echo client written using the official slackclient library. """
import os
from slack import RTMClient


@RTMClient.run_on(event="message")
async def echo(**payload) -> None:
    """ Echo all messages seen by the app except our own. """
    data = payload["data"]
    web_client = payload["web_client"]

    if data["subtype"] != "bot_message":
        web_client.chat_postMessage(
            channel=data["channel"], text=data["text"], thread_ts=data["thread_ts"]
        )


if __name__ == "__main__":
    slack_token = os.environ["SLACK_API_TOKEN"]
    rtm_client = RTMClient(token=slack_token)
    rtm_client.start()
```

The Layabout example is a little more terse, but neither is a lot of code. They
both leverage a decorator pattern for callback registration and support type
annotations. The official library also adds `async` support. It should be
relatively straightforward to translate a Layabout application to using the
offical library.

### Event-oriented decorator API

At the time that I wrote Layabout, the slackclient library provided more of a
low-level API, so Layabout functioned as a refinement on reading from the
WebSocket connection in a loop. It seems Rodney and I both agreed that the
decorator pattern is much more convenient for callback registry. The only
important thing that the official library does differently is give you a
`payload` dictionary rather than individual arguments. Both a `slack` instance
and an `event` are included in that `payload`, so this is a minor change.

### Async

The rewrite of the slackclient library brought with it clever, optional support
for [Python's `async`/`await` syntax][async await]. At the time I was writing
Layabout I wanted to add support for that myself, but the only available API
was synchronous. Interacting with the Slack API via WebSockets lends itself
naturally to an asynchonous approach. In my opinion, using the offical library
will give a big advantage over Layabout here. If you've structured your
Layabout callbacks well and haven't done necessarily synchronous operations,
then you should be fine here.

### Type annotations

Like Layabout, the slackclient library now has [type annotations], which I
think are a fantastic addition to Python. If you choose to add a type checker
like [mypy] or [Pyre] to your toolkit, you can get the benefit of optional
static analysis. Layabout no longer provides an extra service since this is
supported by the slackclient library directly.

## What's Missing?

There are three main pieces of functionality that Layabout still provides that
aren't available with the official slackclient library.

1. The `*` event

   Layabout supported registering a function to trigger on **all** events with
   `@app.handle("*")`. This was primarily useful in debugging, but I think you
   can achieve similar results by setting the logging level to `logging.DEBUG`.

2. Auto-loading environment variables

   Dealing with credentials is always a pain in the butt, so I designed
   Layabout to automatically load the Slack API token from `$LAYABOUT_TOKEN` by
   default. Or, with `app.run(connector=EnvVar("WHATEVER")` you could
   load the token from `$WHATEVER` environment variable you pleased.

3. The run `until` option

   With Layabout you could use `app.run(until=...)` to provide an arbitary
   function which would trigger an exit from the application's core loop. I
   added this to enable cleaner testing with fewer mocks. However, bots are
   usually meant to be long-running applications, so I'm not sure this was ever
   useful enough to justify its existence.

These are all handy features, but I don't think any of them are consequential
enough to be worth keeping Layabout around. If, going forward, you miss these
features, they're probably better suited to be suggestions or pull requests to
the official library now.


## Thanks

If you used Layabout, _thank you_. I hope you got as much joy out of it as a
user as I got in writing it. I would also like to thank these fine folks for
their contributions in getting Layabout off the ground and helping maintain it.

- Alex LordThorsen ([@rawrgulmuffins])
- Geoff Shannon ([@RadicalZephyr])
- Kyle Rader ([@kyle-rader])
- Mike Canoy ([@mikecanoy])
- Sophie Anderson ([@SophieKAn])

[Layabout]: https://layabout.readthedocs.io/en/latest
[Haskell workshop]: https://github.com/ricardojusto/haskell-workshop/blob/f96aa901700d0b10dad35f391a94017f502fb42a/s01/e10/bot/receive
[Twitter shout-out]: https://twitter.com/roach/status/1019279698092744705
[@roach]: https://twitter.com/roach
[official Python Slack client]: https://github.com/slackapi/python-slackclient
[Rodney Urquhart]: https://twitter.com/RodneyU215
[rewrote the slackclient library]: https://slack.engineering/rewriting-the-slack-python-sdk-ea000f587de7
[announced Layabout]: /posts/announcing-layabout
[async await]: https://www.python.org/dev/peps/pep-0492/
[type annotations]: https://www.python.org/dev/peps/pep-0484/
[mypy]: http://mypy-lang.org/
[Pyre]: https://pyre-check.org/
[@rawrgulmuffins]: https://github.com/rawrgulmuffins
[@RadicalZephyr]: https://github.com/RadicalZephyr
[@kyle-rader]: https://github.com/kyle-rader
[@mikecanoy]: https://github.com/mikecanoy
[@SophieKAn]: https://github.com/SophieKAn
