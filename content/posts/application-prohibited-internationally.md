+++
title = "Application Prohibited Internationally"
description = "An API that won't work if you're in Portugal."
url = "posts/application-prohibited-internationally"
date = 2025-12-28T14:14:00-08:00
[taxonomies]
tags = ["time", "i18n", "csharp", "dotnet"]
+++

Many programmers are accustomed to the idea that
[dealing with time is hard][time_falsehoods]. Despite that it's still quite
easy for things to go awry, even when you think you're doing the right thing.
This is the story of a bug report from Portugal that ended up being the most
mysterious problem I've solved at work so far.

<!-- more -->

# The Chalk Outline

At `$DAYJOB` I was working on a team which maintains a particular command line
tool. One day a user reported to us something like this:

> Your tool works for me, but only if I delete this file after every use.

Sounds odd. Who would design such an application? Surely not us.
Inquiring further we got some reproduction steps that amounted to

1. ✅ Run the tool. It works.
2. ❌ Run the tool. It fails.
3. 🗑️ Delete the cache file the tool creates.
4. ✅ Run the tool. It works.

Well, shucks, not only is that weird, but I can't reproduce the issue on my
machine when I use the tool. Neither can any of my co-workers. Maybe we goofed
and we're somehow corrupting that cache file? Let's get some verbose logs from
the user and see if that tells us anything.

# The Plot Thickens

The logs came back with an incredibly cryptic sounding message.

```
TF400898: An Internal Error Occurred
```

It might not seem like much to go off of at first, but it was enough to point
me in the right direction. The error message wasn't coming from our tool, but
from an external service we interacted with.

Ultimately I determined that when the user deleted their cache file it altered
the program behavior to avoid an [API][api] call. When the cache file did exist
we were making an extra API call to validate the cache contents. The
`Internal Error` came from that service. But why?

# The Smoking Gun

Luckily, the verbosity of the logs included a [correlation ID]. When we opened
a support inquiry with the owners of the API we were able to get very specific
answers about why this was failing.

The error, it turned out, was a [500 Internal Server Error] coming from an
undocumented, internal-only API. Furthermore, the internal API was not being
used correctly. There was a stack trace with an error that said

```
System.FormatException: String was not recognized as a valid DateTime
```

The value of said invalid string was

```
sáb%2C 26 out 2024 18%3A01%3A42 GMT
```

The API support engineers were reasonably confused and suggested we should
start by not calling the internal-only API with invalid data.

A little more curiosity and some sleuthing seemed to paint our tool as the
primary suspect. What was up with that string value anyway? We hadn't corrupted
the cache earlier, but maybe we were doing something weird with datetimes?
Well, when translated for [percent encoding] it ends up being

```
sáb, 26 out 2024 18:01:42 GMT
```

The `á` indicated some non-English-speaking language, but which one? Turns out,
the user of our original bug report was located in Portugal!

- `sáb` is short for [Sábado], the Portuguese word for Saturday.
- `out` is short for [Outubro], the Portuguese word for October.

On seeing this new info about the "invalid string" the user decided to set
their system's locale to an English-speaking one. _**The problem went away!**_
Clearly our tool was messing up and calling the internal API with a datetime
generated on the user's system. How else could a Portuguese datetime reach the
server?

# Whodunnit

It seemed so obvious that we were at fault, but I couldn't figure out how! I
scoured our code, but found no reference to the internal API. Moreover, none of
the public APIs that we were calling received datetimes as input. We weren't
even collecting any user-controlled strings to submit to the API.

At this point I was nearly stumped, but on a whim I said to myself what if it
isn't our tool? What if it _**is**_ the server after all? How could that
possibly work?

Apparently keeping the [MDN HTTP Headers reference] under your pillow has some
benefits because I remembered that the [`Accept-Language`][accept_language]
header exists.

I looked through the source code of the API client library that our tool used
and what did I find?

```c#
if (!String.IsNullOrEmpty(CultureInfo.CurrentUICulture.Name)
{
    this.AcceptLanguages.Add(CultureInfo.CurrentUICulture);
}
```

Under the hood the API client library was submitting the user's language and
locale choice to the server. This opened up the possibility that our tool
wasn't responsible for generating the datetime!

To lend further credence to this idea I took our tool out of the mix and used
[`curl`][curl] to submit the API requests directly.

```
curl --header 'Accept-Language: en-US' https://api.tld?query=parameter
```

The API request worked just fine on my machine with `en-US` as the
[language tag]. Other English-speaking tags like `en-CA` for Canada or `en-GB`
for Great Britain worked, but `pt-PT` for Portugal failed! Testing for other
non-English tags like `fr-FR`, `de-DE`, `ja-JP`, and `zh-CN` revealed that with
no difference in API payload the API failed unless `Accept-Language` was set to
an English-speaking locale.

I had demonstrated that this was indeed a server-side issue. All that remained
was for me to uncover how it happened!

# Means and Opportunity

**TODO: Change these dates (either to the original or to the date of publication).**

Luckily, I had access to both the client and server code for this API. I knew
the routes that were involved from the client code, so I could explore freely
with some idea of what I was looking for. I traced the path through the
server code from the initial [ASP.NET] controller entrypoint to the application
logic.

Along the way I discovered that it was actually the public API code that 
called the internal API (which makes sense). The internal API required a
timestamp as one of its arguments. Specifically, it required a timestamp
formatted according to [RFC 1123] and the public API devs were only too happy
to oblige.

In essence, what the public API did before calling the internal API was this.

```c#
// Timestamp generated in the public-facing API.
// ddd, dd MMM yyyy HH':'mm':'ss 'GMT'
var RFC1123Pattern = DateTimeFormatInfo.InvariantInfo.RFC1123Pattern;

// Sun, 23 Mar 2025 20:15:13 GMT
var utcNow = DateTime.UtcNow.ToString(RFC1123Pattern);
```

Later, within the internal API code that timestamp was parsed from a string
back into a [DateTime] like this.

```c#
// Timestamp received in the internal-only API.
DateTime.ParseExact(utcNow, "R", CultureInfo.InvariantCulture);
```

Our problem was somewhere between these two calls. One to generate the
timestamp, the other to parse it. But how? Neither API's code made any attempt
to localize the timestamp. Neither API even handled the `Accept-Language`
header that put me on this train of thought to begin with.

C# and .NET are still somewhat foreign to me, so I had to do some homework. As
it turns out, much has been written on the topic of parsing `DateTime`s in
.NET. [Jeff Moser]'s [_Does Your Code Pass the Turkey Test?_][turkey_test]
dives deep into the many thorny issues of [internationalization] and
[Scott Hanselman]'s piece on the
[subtlety of `DateTime.ParseExact`][datetime_parseexact] has this to say

> ... `InvariantCulture` is almost always necessary when you’re working in a
> non-UI context.

[`InvariantCulture`][invariantculture] is .NET's way of handling
> ... culture-sensitive string operations that are not affected by the
> conventions of the current culture and that are consistent across cultures.

This accurately describes how we want this timestamp parsing to work. The
parsing is _potentially_ culture-sensitive, but we're working with a fixed
format where days can only be expressed as `Mon`, `Tue`, etc. and months can
only be expressed as `Jan`, `Feb`, etc. RFC 1123 inherits **strong**
[Anglocentrism] from [RFC 822]. People were less concerned with
[i18n][internationalization] in 1982 and 1989.

The internal API code was using `InvariantCulture` to parse the timestamp, but
the public API was not using it to generate the timestamp. Unfortunately, this
left the door wide open for bugs. If you generate a `DateTime` in a specific
culture and then try to parse it with `InvariantCulture` you're going to have a
bad time.

```c#
// domingo, 23 mar. 2025 20:15:13 GMT
var portugueseCultureInfo = new CultureInfo("pt-PT");
var portugueseNow = DateTime.UtcNow(RFC1123Pattern, portugueseCultureInfo);

// 💣💥 Boom! This triggers a `System.FormatException`!
DateTime.ParseExact(portugueseNow, "R", CultureInfo.InvariantCulture);
```

In our case though the developer hadn't written anything so obviously wrong.
Rather, they'd written

```c#
var now = DateTime.UtcNow.ToString(RFC1123Pattern);
```

which seems innocuous at first glance. Sadly, passing an explicit culture to
`ToString` is not the only way for a specific culture to end up in your string.


Unbeknownst to the public API developer there was a dragon lurking at the top
of the call stack. 

```c#
var currentCulture = new CultureInfo(request.Headers.AcceptLanguage);
Thread.CurrentThread.CurrentCulture = currentCulture;
```

In a head-tilting design decision, someone had used
[`Thread.CurrentThread.CurrentCulture`][currentculture] to set the culture for
the **entire thread** based on the `Accept-Language` header in one of the
controller base classes. This invisible decision was something like a
half-dozen layers of inheritance removed from visibility for the public API
devs, let alone the internal API.

With that hidden footgun it's no longer safe to call
`DateTime.UtcNow.ToString`! You could be generating a timestamp in any culture.
Scott Hanselman's "almost always necessary" comment feels particularly astute
in light of this.

# Closing the Case

I would have liked to tease apart the design decision to set culture at a
thread level, but who knows what other house of cards behaviors that might have
uncovered. The simplest, most surgical fix for this issue was to just generate
the required timestamp using `InvariantCulture`.

```c#
var now = DateTime.UtcNow.ToString(RFC1123Pattern, CultureInfo.InvariantCulture);
```

I submitted a patch and the API team was happy to merge it. With that fix in
place the public API ignored the thread-specific culture and always generated
timestamps for the internal API with an English language format. Callers of the
public API from Portugal, France, Germany, Japan, or China were now able to use
it without the mysterious `TF400898: An Internal Error Occurred`.

# Postmortem

If you've followed the "Crimes with `DateTime`s" tale this far then, like me,
you might have a **lot** of lingering questions. I'll do my best to answer the
ones I can and leave the rest as a thought exercise for the reader.

## Motive

You might have noticed that I omitted motive from the title above. We found the
means and the opportunity, but _why_ did the devs of the internal API choose to
require an RFC 1123 timestamp?

Thankfully, they left a clue about their motivation in a comment next to their
`DateTime.ParseExact` call. Paraphrasing a bit, it essentially said:

> We have to use the `"R"` formatter because JavaScript's `Date.toUTCString`
> gives dates like `Mon, 17  Apr 2006 21:22:48 GMT`.

So, the devs were somehow bound to JavaScript's idea of what a datetime should
be. In 2025 it's easy to be critical of such a decision, but that example date
in 2006 date should be our cue to have a little sympathy.

JavaScript's [`Date`][date] is **notoriously** bad.
[`Date.toUTCString`][date_tostring] follows [RFC 7231] which has RFC 1123 as a
distant relative. It's inspired by a [Java class][java_util_date] that was
already deprecated in 1997. Also, [`Date.toISOString`][date_toisostring] wasn't
introduced until ECMAScript 5 in 2009. If this code _was_ written in 2006,
[`Temporal`][temporal] wouldn't be a [twinkle in someone's eye][maggiepint] for
another decade, let alone a [TC39] proposal. If these devs were facing pressure
from a front-end team to make their API accessible to JavaScript in 2006, then
their options weren't great. At least they used the common glue of RFC 1123
which was still a relevant standard.

## Why Set the Thread Culture?

I have to speculate on this one, but the public API in question is many years
old and heavily tied to a front-end UI. While largely [RESTful], the API and UI
have grown in concert with each other (as evidenced by aforementioned JS
influence). Understanding some of the resulting design decisions is as much
archaeology as engineering.

Timestamps aren't the only thing governed by culture. Certain translation of
strings the user might see in the UI could be affected too. Having
thread-specific culture opens the door for some bugs it likely closes the door
on others and was probably convenient to manage centrally.

If you started from scratch I'm sure there's a way that's more explicit, but
the number of hours involved and the the number of other things that might
break as a result is likely too high to justify the effort. As usual, it's
tradeoffs all the way down.

## Why Is .NET Like This?

Now we enter the realm of questions for which I don't have answers. It seems
trite at this point, but isn't mutable global (or thread-local) state known to
be the root of all evil?

- Why does [`DateTime.ToString`][datetime_tostring] touch thread state?
- Why use a method overload to opt into the stable `InvariantCulture`?
- Why not have a stable default and opt into unstable `CurrentCulture`?
- Why integrate `System.DateTime` with the `System.Globalization` namespace?

I have my quibbles with these design choices, but .NET has a storied history of
being a successful choice for a lot of people. Especially if your goal is
developer productivity for multi-threaded, graphical, application programming.

I suspect the intention was to create a pragmatic set of defaults which
encourage the right behavior. The goal, as [Jeff Atwood] has talked about,
should be "fall[ing] into the [The Pit of Success]", a phrase coined by a
language designer at Microsoft. In this case it's far too easy to fall into
"pit of despair" by choosing the simplest option.

My personal assessment is that the framework designers only partially
succeeded. `DateTime.ToString` is hiding complexity from the programmer that
lulls them into a false sense of safety. The docs for that method have a lot of
culture-specific remarks that are almost too much information with too few
warnings about the pitfalls.

## What Could the Devs Have Done Differently?

- Linting ([CA1304](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1304) or [CA1305](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1305))
- Mention `DateTimeOffset`?
- Better, don't let JavaScript dictate the format of your internal timestamps.
- Use ISO 8601
- Or an even more modern RFC

<hr>

Thanks for reading this far! Happy New Year! May your bugs be trivial and your
timestamps ISO 8601.

**TODO: END HERE**

foo

- Thread local (global?) state is the root of all evil?
- Why does `DateTime.ToString()` rely on a global thread setting?
- Why should one have to use the overload to specify `CultureInfo.InvariantCulture`?
- The [`DateTime.ToString`](https://learn.microsoft.com/en-us/dotnet/api/system.datetime.tostring?view=net-9.0)
  docs have a lot of culture-specific remarks that are almost too much
  information with too few warnings.
- It's easy to fall into the wrong pattern by choosing the simplest option.
- Is the ultimate problem that the `DateTime.ToString` method hides necessary
  complexity from the programmer and makes them think they're doing something
  safe?
- Why does the `System.DateTime` struct integrate with the
  `System.Globalization` namespace in this way?
- Datetimes and localization become tightly coupled.
- Would using `DateTimeOffset` have helped in this case?

## Would Rust be any better?

Given my ardent advocacy for Rust over the last several years I was compelled
to ask, would this would have gone better if we'd used Rust instead? After
a few hours of noodling around with this I personally think the answer is yes.

Rust's approach to this sort of thing differs greatly from .NET. In general its
library ecosystem is younger and the standard library is intentionally leaner.
[Frustratingly](https://kerkour.com/rust-stdx), this often means that libraries
for certain domains are either less mature or less clearly supported. There's a
[proposed RFC](https://github.com/rust-lang/rfcs/pull/3810) which hopes to
address this, but it's _brand new_.

On the flip side, this can be a blessing. Today, there's nothing in Rust that
ties a global notion of locale to datetime libraries by default. Additionally,
there isn't a datetime module in the standard library, only a
[`time`](https://doc.rust-lang.org/std/time/index.html) module with structs
like [`Duration`](https://doc.rust-lang.org/std/time/struct.Duration.html)
and [`Instant`](https://doc.rust-lang.org/std/time/struct.Instant.html) for
simple use cases.

For complex datetime operations the Rust community enjoys a few high quality,
["blessed"](https://blessed.rs/) crates.

- [`time`](https://crates.io/crates/time) &mdash; Separate from `std::time`.
  Haven't used it myself in years, but it's widely used. More limited in its
  API.
- [`chrono`](https://crates.io/crates/chrono) &mdash; The most heavily used of
  the datetime libraries. I've relied on it a lot. Battle-tested, but more
  complex in its API.
- [`jiff`](https://crates.io/crates/jiff) &mdash; The youngest of the datetime
  libraries. Inspired by [TC39](https://tc39.es/)'s modern
  [Temporal Proposal](https://tc39.es/proposal-temporal/docs/). Aims to address
  some of the gaps in `time` and `chrono`'s APIs.

Despite being the newer entry I reached for `jiff` to evaluate Rust's
capabilities. That decision was largely due to the legendary status of its
primary author, Andrew Gallant (a.k.a.
[burntsushi](https://burntsushi.net/about/)). Andrew has been shaping the Rust
library ecosystem since its early days and is responsible for some of its most
important crates.

## The Pit of Success

The documentation for `jiff` offers this description.

> Jiff is a datetime library for Rust that encourages you to jump into the pit
> of success.

Given the circumstances
[The Pit of Success](https://blog.codinghorror.com/falling-into-the-pit-of-success/)
sounds desirable. It's also moderately humorous to me that the phrase
originates from [a comment](https://learn.microsoft.com/en-us/archive/blogs/brada/the-pit-of-success)
by a Microsoft researcher on language and API design. I wonder what they would
think of the .NET API.

So, how does `jiff` handle our scenario? Let's start with getting a timestamp.

```rust
use jiff::{Timestamp, tz::TimeZone};

let now = Timestamp::now().to_zoned(TimeZone::UTC);
```

The documentation immediately leads us to understand the difference between a
[Timestamp](https://docs.rs/jiff/0.2.13/jiff/struct.Timestamp.html) and a
timezone aware [Zoned](https://docs.rs/jiff/0.2.13/jiff/struct.Zoned.html)
value. Furthermore, it heavily encourages using the latter.

A `Zoned` prints as an [RFC 9557](https://datatracker.ietf.org/doc/html/rfc9557)
compliant string.

```rust
// 2025-05-17T22:02:07.134368889+00:00[UTC]
println!("{now}");
```

This locale independent representation starkly contrasts with .NET's default.

```c#
// 05/17/2025 22:02:07
var now = DateTime.UtcNow.ToString();
Console.WriteLine(now);
```

[`DateTime.ToString`](https://learn.microsoft.com/en-us/dotnet/api/system.datetime.tostring?view=net-9.0)
defaults to "using the formatting conventions of the current culture." There
are overloads which accept specific formats, but if you naively convert a
`DateTime` to a string you never know exactly what you'll get.

`jiff` purposefully [punted](https://github.com/BurntSushi/jiff/issues/4) on
locale support, acknowledging the "difficulty of the task" and that

> ... all of the datetime string formats supported are "machine" readable interchange formats ...

Instead, `jiff` points people towards the [`icu`](https://crates.io/crates/icu)
internationalization library. More specifically, it encourages the use of the
separate [`jiff-icu`](https://crates.io/crates/jiff-icu) crate for
interoperability.

## What if I need an RFC 1123 timestamp?

In a reasonable world we could stop here. `jiff` lead us to the modern
understanding of a good string representation for a machine readable datetime.
Our original aim, after all, was to provide a timestamp for an internal API
that is never read by humans.

Maybe we're not so fortunate though. Maybe for reasons beyond our ken that
internal API stubbornly insists on an RFC 1123 formatted value. What then?

There's the
[`strtime`](https://docs.rs/jiff/0.2.13/jiff/fmt/strtime/index.html)
module and associated convenience methods for
[`strptime`](https://pubs.opengroup.org/onlinepubs/009695399/functions/strptime.html)
and
[`strftime`](https://pubs.opengroup.org/onlinepubs/009695399/functions/strftime.html)
style conversions.

```rust
use jiff::{Zoned, TimeZone, fmt::strtime};
const RFC1123: &str = "%a, %d %b %Y %H:%M:%S GMT";

let now = Timestamp::now().to_zoned(TimeZone::UTC);
let formatted = strtime::format(RFC1123, &now)?;

// Sat, 17 May 2025 22:02:07 GMT
println!("{formatted}");
```

There are perils and some incorrectness here. **TODO**

If you've got a bit more luck and your target actually accepts
[RFC 2822](https://datatracker.ietf.org/doc/html/rfc2822) compliant values
there's the
[`rfc2822`](https://docs.rs/jiff/0.2.13/jiff/fmt/rfc2822/index.html)
module which provides coversion utilities.

```rust
use jiff::{Timestamp, TimeZone, fmt::rfc2822};

let now = Timestamp::now().to_zoned(TimeZone::UTC);
let formatted = rfc2822::to_string(&now)?;

// Sat, 17 May 2025 22:02:07 +0000
println!("{formatted}");
```

It's worth mentioning that `jiff::fmt::rfc2822` also comes with a
[warning](https://docs.rs/jiff/0.2.13/jiff/fmt/rfc2822/index.html#warning).

> ... you should not choose it as a general interchange format for new
> applications.

At any rate, you can't end up with a string that contains locale-specific
translations because the available APIs intentionally don't allow for it.

## What if I need an internationalized RFC 1123 timestamp?

First off, no you don't. Second, while it's _possible_ to generate this, doing
so is so cumbersome that a reasonable person would probably question whether
they're doing something wrong.

<hr>

## TODO

What does AI default to when generating an RFC 1123 timestamp in C#?

- Should I mention [`temporal_rs`](https://crates.io/crates/temporal_rs) that just came out a few days ago?

- Ultimately the Rust approach requires you to be more specific and know more about datetimes.

  - Can lead to errors when making the wrong choice.
  - Makes sense for a systems programming language which wants to have as little baggage in the standard library as possible.
  - Might not make sense for an application language like C#.

- Specify versions of libraries used (e.g. `jiff@0.2.5`)

- Rust might just not be ready for this yet. See [this issue](https://github.com/unicode-org/icu4x/issues/6180) from just 3 weeks ago.
- Could I use `2.0.0-beta2`?
- What is [Semantic Skeleta](https://unicode-org.atlassian.net/browse/CLDR-17842)?
- Could that have prevented this problem? Was runtime dynamic behavior without compile-time checks for the semantic usage of the `R` flag with the `InvariantCulture` the issue?

In the end, the best I can say is that had they been using Rust the
programmer might have been exposed to enough information to give them the idea
that using and RFC 1123 datetime was a poor choice to begin with.

[time_falsehoods]: https://infiniteundo.com/post/25326999628/falsehoods-programmers-believe-about-time
[api]: https://en.wikipedia.org/wiki/API
[correlation ID]: https://microsoft.github.io/code-with-engineering-playbook/observability/correlation-id/
[500 Internal Server Error]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/500
[percent encoding]: https://en.wikipedia.org/wiki/Percent-encoding
[Sábado]: https://pt.wikipedia.org/wiki/S%C3%A1bado
[Outubro]: https://pt.wikipedia.org/wiki/Outubro
[MDN HTTP Headers reference]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers
[accept_language]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language
[curl]: https://en.wikipedia.org/wiki/CURL
[language tag]: https://en.wikipedia.org/wiki/IETF_language_tag
[ASP.NET]: https://en.wikipedia.org/wiki/ASP.NET
[RFC 1123]: https://datatracker.ietf.org/doc/rfc1123/
[DateTime]: https://learn.microsoft.com/en-us/dotnet/api/system.datetime
[Jeff Moser]: https://www.moserware.com/about/
[turkey_test]: https://www.moserware.com/2008/02/does-your-code-pass-turkey-test.html
[internationalization]: https://en.wikipedia.org/wiki/Internationalization_and_localization
[Scott Hanselman]: https://www.hanselman.com/about
[datetime_parseexact]: https://www.hanselman.com/blog/dateparseexact-and-the-subtle-goo-that-is-datetime-format-strings
[invariantculture]: https://learn.microsoft.com/en-us/dotnet/fundamentals/runtime-libraries/system-globalization-cultureinfo-invariantculture
[Anglocentrism]: https://en.wikipedia.org/wiki/Anglocentrism
[RFC 822]: https://datatracker.ietf.org/doc/html/rfc822#section-5
[currentculture]: https://learn.microsoft.com/en-us/dotnet/api/system.threading.thread.currentculture
[RESTful]: https://en.wikipedia.org/wiki/REST
[datetime_tostring]: https://learn.microsoft.com/en-us/dotnet/api/system.datetime.tostring?view=net-9.0
[Jeff Atwood]: https://blog.codinghorror.com/falling-into-the-pit-of-success/
[The Pit of Success]: https://learn.microsoft.com/en-us/archive/blogs/brada/the-pit-of-success
[date]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date
[date_tostring]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toUTCString
[java_util_date]: https://docs.oracle.com/javase/8/docs/api/java/util/Date.html
[RFC 7231]: https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.1.1
[date_toisostring]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
[temporal]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal
[maggiepint]: https://maggiepint.com/2017/04/09/fixing-javascript-date-getting-started/
[TC39]: https://tc39.es/
