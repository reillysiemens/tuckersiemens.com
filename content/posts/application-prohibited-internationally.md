+++
title = "Application Prohibited Internationally"
description = "An API that won't work if you're in Portugal."
url = "posts/application-prohibited-internationally"
date = 2025-12-28T14:14:00-08:00
[taxonomies]
tags = ["time", "internationalization", "csharp", "dotnet", "rust"]
+++

At this point many programmers are accustomed to the idea that
[dealing with time is hard][time_falsehoods]. Despite that it's still quite
easy for things to go awry, even when you think you're doing the right thing.
This is the story of a bug report from Portugal that ended up being the most
mysterious problem I solved at work recently.

<!-- more -->

# The Chalk Outline

At `$DAYJOB` I was working on a team which maintains a particular command line
tool. One day a user reported to us something like this:

> Your tool works for me, but only if I delete this file after every use.

I'll be darned if that didn't sound odd. Who would design such an application?
Surely not us. Inquiring further we got some reproduction steps that amounted
to

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
the program behavior to avoid an API call. When the cache file did exist we
were making an extra API call to validate the cache contents. The
`Internal Error` came from that service. But why?

# The Smoking Gun

Luckily, the verbosity of the logs included a [correlation ID]. When we opened
a support inquiry with the owners of the API we were able to get very specific
answers about why this was failing.

The error, it turned out, was a [500 Internal Server Error] coming from an
undocumented, internal-only API. Furthermore, the internal API was not being
used correctly. There was a stack trace with an error that said

```
System.FormatException: String was not recognied as a valid DateTime
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

# Means, Motive, and Opportunity

TODO: Pick up here next!

<hr>

- TODO: Change these dates (either to the original or to the date of publication).
- TODO: Note that it was an internal API generating the timestamp according to the culture.

```c#
using System.Globalization;

// ddd, dd MMM yyyy HH':'mm':'ss 'GMT'
var RFC1123Pattern = DateTimeFormatInfo.InvariantInfo.RFC1123Pattern;

// Sun, 23 Mar 2025 20:15:13 GMT
var utcNow = DateTime.UtcNow.ToString(RFC1123Pattern);
Console.WriteLine(utcNow);

// Change the CultureInfo for this specific thread.
Thread.CurrentThread.CurrentCulture = new CultureInfo("pt-PT");

// domingo, 23 mar. 2025 20:15:13 GMT
var portugueseNow = DateTime.UtcNow.ToString(RFC1123Pattern);
Console.WriteLine(portugueseNow);

// Boom! 💣💥
DateTime.ParseExact(portugueseNow, "R", CultureInfo.InvariantCulture);
```

# The Fix

```c#
var portugueseNow = DateTime.UtcNow.ToString(RFC1123Pattern, CultureInfo.InvariantCulture);
```

# Postmortem

## Why did the devs use RFC1123?

- JavaScript's [`Date.toUTCString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toUTCString)
- [RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#section-7.1.1.1)
- Presumably some calling code for another internal

## How do these RFCs relate to one another?

- [RFC 1123](https://datatracker.ietf.org/doc/rfc1123/) supercedes [RFC 822](https://datatracker.ietf.org/doc/html/rfc822#section-5).

## Why did the devs set the culture on a thread level? What else could they have done?

- The number of other things that would likely break if this was changed is too high.

## Why is .NET like this?

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
[correlation ID]: https://microsoft.github.io/code-with-engineering-playbook/observability/correlation-id/
[500 Internal Server Error]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/500
[percent encoding]: https://en.wikipedia.org/wiki/Percent-encoding
[Sábado]: https://pt.wikipedia.org/wiki/S%C3%A1bado
[Outubro]: https://pt.wikipedia.org/wiki/Outubro
[MDN HTTP Headers reference]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers
[accept_language]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language
[curl]: https://en.wikipedia.org/wiki/CURL
[language tag]: https://en.wikipedia.org/wiki/IETF_language_tag
