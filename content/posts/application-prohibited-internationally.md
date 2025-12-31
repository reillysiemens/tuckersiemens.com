+++
title = "Application Prohibited Internationally"
description = "An API that won't work if you're in Portugal."
url = "posts/application-prohibited-internationally"
date = 2025-12-31T15:35:00-08:00
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

// Wed, 31 Dec 2025 22:11:57 GMT
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

# Whatever Remains, However Improbable

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
// quarta, 31 dez. 2025 22:11:57 GMT
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

> We have to use the [`"R"` formatter][format_specifiers] because JavaScript's
> `Date.toUTCString` gives dates like `Mon, 17  Apr 2006 21:22:48 GMT`.

So, the devs were somehow bound to JavaScript's idea of what a datetime should
be. In 2025 it's easy to be critical of such a decision, but that example date
in 2006 date should be our cue to have a little sympathy.

JavaScript's [`Date`][date] is **notoriously** bad.
[`Date.toUTCString`][date_tostring] follows [RFC 7231] which has RFC 1123 as a
distant relative. It's inspired by a [Java class][java_util_date] that was
already deprecated in 1997. Also, [`Date.toISOString`][date_toisostring] wasn't
introduced until ECMAScript 5 in 2009. If this code _was_ written in 2006,
[`Temporal`][temporal] wouldn't be a [twinkle in someone's eye][maggiepint] for
another decade, let alone a [TC39] proposal. Devs facing any pressure from a
front-end team to make their API accessible to JavaScript in 2006 didn't have
stellar options. At least they used the common glue of RFC 1123 which was still
a relevant standard.

## Why Set the Thread Culture?

I have to speculate on this one, but the public API in question is many years
old and heavily tied to a front-end UI. While largely [RESTful], the API and UI
have grown in concert with each other (as evidenced by aforementioned JS
influence). Understanding some of the resulting design decisions is as much
archaeology as engineering.

Timestamps aren't the only thing governed by culture. Certain translation of
strings the user might see in the UI could be affected too, such as whether to
use `.` or `,` as a numerical separator. Having thread-specific culture opens
the door for some bugs it likely closes the door on others and was probably
convenient to manage centrally.

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
- Why _not_ have a stable default and opt into unstable `CurrentCulture`?
- Why integrate `System.DateTime` with the `System.Globalization` namespace?

I have my quibbles with these design choices, but .NET has a storied history of
being a successful choice for a lot of people. Especially if your goal is
developer productivity for multi-threaded, graphical application programming.

I suspect the intention was to create a pragmatic set of defaults which
encourage the right behavior. The goal, as [Jeff Atwood] has talked about,
should be "fall[ing] into the [The Pit of Success]" (a phrase coined by a
language designer at Microsoft). In this case, it's far too easy to fall into
"pit of despair" by choosing the simplest option.

My personal assessment is that the framework designers only partially
succeeded. `DateTime.ToString` is hiding complexity from the programmer that
lulls them into a false sense of safety. The docs for that method have a lot of
culture-specific remarks that are almost too much information with too few
warnings about the pitfalls.

## Looking to the Future

It's easy to criticize, but I should offer some constructive commentary as
well. Knowing pitfalls exist in the framework, what could the devs have done
differently? If you mention `DateTime` in a search you'll find plenty of
results suggesting you use [`DateTimeOffset`][datetimeoffset] instead, but that
actually has the same problem.

The lowest hanging fruit is linting. In his blog post from 2008 Jeff Moser
mentions two rules:

- [CA1304] &mdash; Specify `CultureInfo`
- [CA1305] &mdash; Specify `IFormatProvider`

Those rules will catch you making the dangerous mistake of relying on the
defaults and suggest you use the overloaded counterparts instead.

The more difficult option is to resist the temptation to let JavaScript dictate
which format you use to represent time. [RFC 3339] had been around for 4 years
in 2006 and [ISO 8601] existed _**as early as 1988!**_ Those standards offer
[a host of datetime formatting options][rfc3339_vs_iso8601] which should have
let them sidestep culture-specific issues. `2025-12-31T22:11:57Z` is harder for
a human to read than `Wed, 31 Dec 2025 22:11:57 GMT`, but a machine will parse
it just fine and there's less room for error.

If you're reading this after 2025, first, thanks for reading this far! Second,
maybe go learn about timezone-aware datetimes. Check out [RFC 9557], read about
the approach [Temporal][temporal] is taking to solve the problems of
JavaScript's `Date`, and maybe peek at the
[.NET docs on dates, times, and time zones][dates_times_and_time_zones].

May all your bugs be trivial and your machine-readable datetimes
```
YYYY-MM-DDTHH:mm:ss.sssssssssZ/±HH:mm[time_zone_id][u-ca=calendar_id]
```

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
[format_specifiers]: https://learn.microsoft.com/en-us/dotnet/standard/base-types/standard-date-and-time-format-strings#table-of-format-specifiers
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
[datetimeoffset]: https://learn.microsoft.com/en-us/dotnet/api/system.datetimeoffset
[CA1304]: https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1304
[CA1305]: https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1305
[RFC 3339]: https://datatracker.ietf.org/doc/html/rfc3339
[ISO 8601]: https://www.iso.org/iso-8601-date-and-time-format.html
[rfc3339_vs_iso8601]: https://ijmacd.github.io/rfc3339-iso8601/
[RFC 9557]: https://datatracker.ietf.org/doc/html/rfc9557
[dates_times_and_time_zones]: https://learn.microsoft.com/en-us/dotnet/standard/datetime/
