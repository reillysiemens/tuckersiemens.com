+++
title = "A Fresh Coat of Paint"
description = "It's time for something new."
url = "posts/a-fresh-coat-of-paint"
date = 2021-12-31T21:04:00-08:00
[taxonomies]
tags = ["webdev", "CSS", "HTML"]
+++
I'm starting the new year with a new job. To paraphrase a friend, "it's just
moving from one `$BIGCORP` to another", but it's still exciting. I worked my
last gig for 5 years, so I'm nervous, but also very ready to do something new.
While I'm doing one new thing I might as well do another. Taking some time off
between jobs has given me enough breathing room to redo my website.

<!-- more -->

## New Features

If you've been here before you'll probably have noticed a significant visual
overhaul. The site is now in dark mode, has a more varied color palette, and is
more responsive to differently sized viewports.

In addition to the visual changes on this site there are new features as well!

1. [Posts] now have summaries thanks to Zola's [summary] feature, which allows
   you to use any content before a
   `<!-- more -->`
   comment in a page's Markdown.

2. There are [tags] as well! These were actually always there, but I only put
   them in post [front matter] and didn't expose them on any pages. Tags are
   supported via Zola's [taxonomies], which are much more complicated and
   powerful than simple tags demand.

3. The metadata for site pages now includes [Open Graph protocol] and
   [Twitter card] support for a better display in social media.

## What I Learned

Every time I update this website I learn something new. I continued to use
vanilla HTML and CSS and eschew JavaScript, but was still blown away by how
little I know in the webdev space.

In the interest of chronicling my newfound knowledge, here are a handful of the
things I learned.

- There are a whole lot of [semantic] HTML tags! I was already using tags like
  `<article>`, `<header>`, and `<footer>`, but I just learned about the
  [`<time>`][time] tag. This allows human-readable dates to still be parsed by
  machines with precision.

  ```html
  <time datetime="1970-01-01T00:00:00+00:00">January 1st, 1970</time>
  ```

  I used it for post metadata where I display only the year, month, and day,
  but put the full [ISO-formatted] publication date in the `datetime`
  attribute.

- CSS has variables! This isn't really new, but it's still cool. I had been
  relying on [Sass] to keep my CSS [DRY], but I committed more fully to vanilla
  CSS this go around and was happy to use this feature.

  For example, with this site, I defined colors in the [`:root`][css-root]
  pseudo-class so I could reference them later using [`var`][var].

  ```css
  :root {
    --background-color: #1d2021;
    --foreground-color: #ebdbb2;
  }

  body {
    background-color: var(--background-color);
    color: var(--foreground-color);
  }
  ```

- There's now a [media query] for [colorscheme][prefers-colorscheme]. I
  ultimately decided not to use it because I wanted a dark website, but I'm
  glad it exists. Building on the above CSS, you could change background and
  foreground color based on user preference.

  ```css
  @media (prefers-color-scheme: light) {
    :root {
      --background-color: #f9f5d7;
      --foreground-color: #3c3836;
    }
  }
  ```

- CSS selectors, especially pseudo-class functions, are extremely powerful.
  Here's the most complex CSS currently used by this site.

  ```css
  /* When internal links are linked directly, display with the accent color. */
  :where(h2, h3, h4, h5, h6):target > a[href^="#"]::before {
    opacity: 1;
    color: var(--primary-accent-color);
  }
  ```

  It uses the [`:where()`][css-where] function and an [attribute selector] to
  ensure that all subheadings display an otherwise invisible element when linked
  to directly, but only when they're internal links! Being able to specify that
  kind of logic in a declarative form is neat stuff.

- Invisible whitespace in your HTML continues to be an enormous source of pain.
  My anchor tag template (the thing that makes the `#` display to the left of
  headings when you hover over them) had a newline at the end of the file. The
  newline was interpolated into the output as an extra node, which caused all
  headings to subtly shift right. I nearly tore my hair out fixing that bug.

I've no doubt that I've committed some grave CSS sins with this revamp.
Nevertheless, I enjoyed seeing what's possible and the important part is that
the site works. 😅

## Inspiration

I would be remiss not to mention the people who inpired these changes. The
colorscheme uses a subset of [Pavel Pertsev]'s [gruvbox], which I've used as my
syntax highlighting theme for years. Post metadata was modeled after [Alexis
King]'s site. I borrowed ideas for the Open Graph and Twitter card support from
[Andrew Kvalheim] and [Amos Wenger].

[Ruud van Asseldonk] deserves the lion's share of credit for these changes. I
spent **hours** learning from their [meticulously crafted CSS]. This update
wouldn't have been possible without everything I learned from them.

[Posts]: /posts
[summary]: https://www.getzola.org/documentation/content/page/#summary
[tags]: /tags
[front matter]: https://www.getzola.org/documentation/content/page/#front-matter
[taxonomies]: https://www.getzola.org/documentation/content/taxonomies/
[Open Graph protocol]: https://ogp.me/
[Twitter card]: https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/markup
[semantic]: https://developer.mozilla.org/en-US/docs/Glossary/semantics
[time]: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/time
[ISO-formatted]: https://en.wikipedia.org/wiki/ISO_8601
[Sass]: https://sass-lang.com/
[DRY]: https://en.wikipedia.org/wiki/Don%27t_repeat_yourself
[css-root]: https://developer.mozilla.org/en-US/docs/Web/CSS/:root
[var]: https://developer.mozilla.org/en-US/docs/Web/CSS/var()
[media query]: https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries
[prefers-colorscheme]: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
[css-where]: https://developer.mozilla.org/en-US/docs/Web/CSS/:where
[attribute selector]: https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors
[Pavel Pertsev]: https://github.com/morhetz
[gruvbox]: https://github.com/morhetz/gruvbox
[Alexis King]: https://lexi-lambda.github.io/
[Andrew Kvalheim]: https://andrew.kvalhe.im/
[Amos Wenger]: https://fasterthanli.me/
[Ruud van Asseldonk]: https://ruudvanasseldonk.com/
[meticulously crafted CSS]: https://github.com/ruuda/blog/blob/e02b663d76dc882952aec37319cafde221695ada/templates/page.css
