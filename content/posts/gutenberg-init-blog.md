+++
title = "gutenberg init blog"
description = "Switching to Gutenberg as my static site generator."
date = 2017-06-18T15:17:00-08:00
[taxonomies]
tags = ["gutenberg", "Rust", "blogging"]
+++
When I first created this site I wanted to get it live as quickly as possible.
[Hexo][hexo], a blogging framework written in Node.js, seemed like the perfect
tool. At the time I was rather interested in Node.js, so it seemed natural to
use a framework rooted in that community.

By the time of my last post I'd become increasingly disinterested in Node.js
and much more interested in Rust and its community. It was mostly
procrastination, but I convinced myself that using a tool written in a language
I didn't use often directly contributed to the paucity of posts here, so I
finally decided to ditch Hexo.

<!-- more -->

## Replacement Criteria

Of course, I needed a suitable replacement. I wanted it to

- Be fast
- Be flexible
- Generate [RSS][RSS] feeds
- Support live reloading
- Support [Markdown][CommonMark]

Fast and flexible are nebulous requirements. Most static site generators are
more than fast enough since I'm not generating a site with hundreds of pages
(yet). My [early experience with Hexo][early Hexo] taught me that while having
a bunch of features out of the box is nice flexibility is more important. I
needed to be able to choose my own deployment mechanisms and structure my site
the way I wanted to.

I don't personally use an RSS feed reader, but I know friends of mine do and
they've asked me to support that ([here ya go][feed link]). I sure as heck
didn't want to generate an RSS feed myself.

Live reloading and Markdown support were non-negotiable requirements. The
write, build, and reload cycle is too tedious to forgo live reloading. I simply
didn't want to use a markup language other than Markdown because writing it is
effortless for me at this point.

## The Hunt

I [surveyed the landscape][staticgen], but didn't find
anything to my liking, so I procrastinated even more. Then I happened across an
[article][Introducing Tera] linked from an [orange website][HN Tera post]
introducing [Tera][Tera], a template engine in Rust. When I saw that the author
drew inspiration from Python's [Jinja2][Jinja2] templating library I got
_really_ excited.

I tried my hand at writing my own static site generator in Rust. I managed to
get a rudimentary POC using Tera operational just in time for
[Vincent Prouillet][Vincent], the author of Tera, to
[announce Gutenberg][announcing Gutenberg]. It met all my replacement criteria,
used the templating engine I was interested in, and was written in Rust!

## Building My New Site

Once I found Gutenberg I attacked fixing up my site with [vigor][vigor]. I
wrote my own templates, learned a little [Sass][Sass], and even managed to make
a [small contribution to Gutenberg][Gutenberg Contribution]. Hexo made my site
largely a black box, but now there isn't a line of the source I haven't
touched.

As an added bonus, I took the redesign opportunity to ensure there's **no
JavaScript anywhere on this site**, so this page renders exactly the same
regardless of whether you're using a JavaScript blocker. In the future I may
relax this constraint, but I'm happy with my decision so far and I was able to
learn more about Flexbox and CSS3 as a result.

I also had time to add custom [**404 Not Found**][404] and
[**50x Server Error**][50x] pages. If you're interested in more little details,
you can find the source for the redesigned site on [GitHub][GitHub repo].

## Credit Where Credit Is Due

This would not have been possible without Vincent's hard work on Tera and
Gutenberg. I also borrowed a great deal from [Alex Sun][Alex Sun]'s
[vida][vida] Jekyll theme in writing this site's Sass. I've learned a lot from
both of them. Thanks!

## What's Next?

This site is in a much better place than it was a year ago. I understand it
better and I'm more motivated to continue working on it, so expect more posts!


[hexo]: https://hexo.io/
[RSS]: https://en.wikipedia.org/wiki/RSS
[CommonMark]: http://commonmark.org/
[early Hexo]: /posts/hexo-init-blog
[feed link]: /rss.xml
[staticgen]: https://www.staticgen.com/
[Introducing Tera]: https://www.vincentprouillet.com/blog/introducing-tera/
[HN Tera post]: https://news.ycombinator.com/item?id=11507188
[Tera]: https://github.com/Keats/tera
[Jinja2]: http://jinja.pocoo.org/
[Vincent]: https://www.vincentprouillet.com/
[announcing Gutenberg]: https://www.vincentprouillet.com/blog/announcing-gutenberg/
[vigor]: https://github.com/reillysiemens/tuckersiemens.com/graphs/contributors?from=2017-04-23&to=2017-06-14&type=c
[Sass]: http://sass-lang.com/
[Gutenberg Contribution]: https://github.com/Keats/gutenberg/commit/7c1cecb2112e087e2ffb45937bea29ebf81df01e
[404]: /404.html
[50x]: /50x.html
[GitHub repo]: https://github.com/reillysiemens/tuckersiemens.com
[Alex Sun]: https://syaning.github.io/
[vida]: https://github.com/syaning/vida
