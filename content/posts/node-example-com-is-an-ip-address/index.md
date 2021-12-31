+++
title = "node.example.com Is An IP Address"
description = "node.example.com is an IP address."
url = "posts/node-example-com-is-an-ip-address"
date = 2020-12-28T06:13:05-08:00
[taxonomies]
tags = ["Python", "Testing", "Networking"]
+++
Hello! Welcome to the once-yearly blog post! This year I'd like to examine the
most peculiar bug I encountered at work. To set the stage, let's start with a
little background.

<!-- more -->

When we write [URLs][URL] with a [non-standard][standard ports] [port] we
specify the port after a `:`. With [hostnames][hostname] and [IPv4] addresses
this is straightforward. Here's some [Python] code to show how easy it is.

```python
>>> url = urllib.parse.urlparse("https://node.example.com:8000")
>>> (url.hostname, url.port)
('node.example.com', 8000)
>>>
>>> url = urllib.parse.urlparse("https://192.168.0.1:8000")
>>> (url.hostname, url.port)
('192.168.0.1', 8000)
```

Unfortunately, when [IPv6] addresses are involved some ambiguity is introduced.

```python
>>> url = urllib.parse.urlparse(
...     "https://fdc8:bf8b:e62c:abcd:1111:2222:3333:4444:8000"
... )
...
>>> url.hostname
'fdc8'
>>> try:
...     url.port
... except ValueError as error:
...     print(error)
...
Port could not be cast to integer value as 'bf8b:e62c:abcd:1111:2222:3333:4444:8000'
```

Since IPv6 addresses use a "colon-hex" format with [hexadecimal] fields
separated by `:` we can't tell a port apart from a normal field. Notice in the
example above that the hostname is truncated after the first `:`, not the one
just before `8000`.

Fortunately, the spec for URLs recognizes this ambiguity and gives us a way to
handle it. [RFC 2732 (_Format for Literal IPv6 Addresses in URL's_)][RFC 2732]
says

> To use a literal IPv6 address in a URL, the literal address should be
> enclosed in "[" and "]" characters.

Update our example above to include `[` and `]` and voilà! It just works.

```python
>>> url = urllib.parse.urlparse(
...     "https://[fdc8:bf8b:e62c:abcd:1111:2222:3333:4444]:8000"
... )
...
>>> (url.hostname, url.port)
('fdc8:bf8b:e62c:abcd:1111:2222:3333:4444', 8000)
```

Armed with that knowledge we can dive into the problem. 🤿

## Works On My Machine

A few months ago a co-worker of mine wrote a seemingly innocuous function.

```python
from ipaddress import ip_address


def safe_host(host): 
    """Surround `host` with brackets if it is an IPv6 address."""
    try:
        if ip_address(host).version == 6:
            return "[{}]".format(host)
    except ValueError:
        pass
    return host
```

Elsewhere in the code it was invoked something like this, so that hostnames,
IPv4 addresses, and IPv6 addresses could all be safely interpolated.

```python
url = "https://{host}:8000/some/path/".format(host=safe_host(host))
```

Since my co-worker is awesome they wrote tests to validate their code. ✅

```python
def test_safe_host_with_hostname():
    """Hostnames should be unchanged."""
    assert safe_host("node.example.com") == "node.example.com"


def test_safe_host_with_ipv4_address():
    """IPv4 addresses should be unchanged."""
    assert safe_host("192.168.0.1") == "192.168.0.1"


def test_safe_host_with_ipv6_address():
    """IPv6 addresses should be surrounded by brackets."""
    assert (
        safe_host("fdc8:bf8b:e62c:abcd:1111:2222:3333:4444")
        == "[fdc8:bf8b:e62c:abcd:1111:2222:3333:4444]"
    )
```

Thank goodness they did. The Python 2 tests failed ([don't look at me like
that][drop-python2] 😒).

```ini
✖ FAIL py27 in 1.83 seconds
✔ OK py36 in 2.82 seconds
✔ OK py37 in 2.621 seconds
✔ OK py38 in 2.524 seconds
✔ OK py39 in 2.461 seconds
```

Both the hostname and IPv6 address tests failed. But _**why**_ did they fail?
And why did the Python 3 tests pass? 🤔

We'll start with the hostname failure and try to isolate the bug.

```python
E       AssertionError: assert '[node.example.com]' == 'node.example.com'
E         - [node.example.com]
E         ? -                -
E         + node.example.com
```

The failure says `node.example.com` was surrounded by brackets, but that's
only supposed to happen for IPv6 addresses! Let's crack open a Python 2
interpreter for a quick sanity check.

```python
>>> ipaddress.ip_address("node.example.com").version
6
```

<img src='confused-jeff-bridges.webp' alt='Confused Jeff Bridges' style='display: block; width: 100%;'>

## What On Htrae?

If, like Jeff Bridges, you were confused by that result, _relax_. We're
probably not in a [Bizarro World] where `node.example.com` is a valid IPv6
address. There must be an explanation for this behavior.

Things start to become a little more clear when we see the result of the
[`ip_address()`][ip_address] function for ourselves.

```python
>>> ipaddress.ip_address("node.example.com")
IPv6Address(u'6e6f:6465:2e65:7861:6d70:6c65:2e63:6f6d')
```

At first glance that looks like madness. Python 3 behaves in an entirely
different manner.

```python
>>> try:
...     ipaddress.ip_address("node.example.com")
... except ValueError as error:
...     print(error)
... 
'node.example.com' does not appear to be an IPv4 or IPv6 address
```

Python 3 knows that's not an IPv6 address, so why doesn't Python 2? The answer
is in how differently the two Python versions handle text.

## Text Is Hard

Computers don't operate on text as humans think of it. They operate on numbers.
That's part of why we have IP addresses to begin with. In order to represent
human-readable text with computers we had to assign meaning to the numbers.
Thus, [ASCII] was born.

ASCII is a [character encoding], which means it specifies how to interpret
[bytes][byte] as text we understand (provided you speak English). So, when your
computer sees `01101110` in [binary] (`110` in [decimal]) you see `n` because
that's what ASCII says it is.

You can see the number to text conversion in action right in the Python
interpreter.

```python
>>> ord("n")
110
>>> chr(110)
'n'
```

In fact, it doesn't matter what numbering system you use. If you specify
binary, [octal], decimal, hexadecimal, whatever... If it can be understood as
the right integer it will be displayed correctly.

```python
>>> chr(0b01101110)
'n'
>>> chr(0o156)
'n'
>>> chr(110)
'n'
>>> chr(0x6e)
'n'
```

Neat, but what does that information do for us?

## It's Numbers All The Way Down

Just for giggles, humor me and let's look at the character-number translations
for `node.example.com`. We'll leave out binary and octal, because they make
this table uglier than it already is.

<table>
  <tbody>
    <tr>
      <th scope="row">Character</th>
      <td>n</td>
      <td>o</td>
      <td>d</td>
      <td>e</td>
      <td>.</td>
      <td>e</td>
      <td>x</td>
      <td>a</td>
      <td>m</td>
      <td>p</td>
      <td>l</td>
      <td>e</td>
      <td>.</td>
      <td>c</td>
      <td>o</td>
      <td>m</td>
    </tr>
    <tr>
      <th scope="row">Decimal</th>
      <td>110</td>
      <td>111</td>
      <td>100</td>
      <td>101</td>
      <td>46</td>
      <td>101</td>
      <td>120</td>
      <td>97</td>
      <td>109</td>
      <td>112</td>
      <td>108</td>
      <td>101</td>
      <td>46</td>
      <td>99</td>
      <td>111</td>
      <td>109</td>
    </tr>
    <tr>
      <th scope="row">Hexadecimal</th>
      <td>6e</td>
      <td>6f</td>
      <td>64</td>
      <td>65</td>
      <td>2e</td>
      <td>65</td>
      <td>78</td>
      <td>61</td>
      <td>6d</td>
      <td>70</td>
      <td>6c</td>
      <td>65</td>
      <td>2e</td>
      <td>63</td>
      <td>6f</td>
      <td>6d</td>
    </tr>
  </tbody>
</table>

Hey, hold on a second... If you tilt your head sideways and squint that last
row looks kinda like an IPv6 address, doesn't it?

We should verify, just to be absolutely certain. You've still got that Python 2
interpreter open, right?

```python
>>> # Convert the characters in the hostname to hexadecimal.
>>> hostname = "node.example.com"
>>> hostname_as_hexadecimal = "".join(hex(ord(c))[2:] for c in hostname)
>>> hostname_as_hexadecimal
'6e6f64652e6578616d706c652e636f6d'
>>>
>>> # Convert the "IP address" to text.
>>> address = ipaddress.ip_address(hostname)
>>> str(address)
'6e6f:6465:2e65:7861:6d70:6c65:2e63:6f6d'
>>>
>>> # Remove the colons from that text.
>>> address_without_colons = str(address).replace(":", "")
>>> address_without_colons
'6e6f64652e6578616d706c652e636f6d'
>>>
>>> # Compare the results and see they're equal.
>>> hostname_as_hexadecimal == address_without_colons
True
```

Sure enough, when you boil them both down to numbers they're the same mess of
hexadecimal.

## The Belly Of The Beast

If we dig into the source code for the Python 2 version of the
[`ipaddress`][ipaddress2] module we ultimately come to a
[curious set of lines].

```python
# Constructing from a packed address
if isinstance(address, bytes):
    self._check_packed_address(address, 16)
    bvs = _compat_bytes_to_byte_vals(address)
    self._ip = _compat_int_from_byte_vals(bvs, 'big')
    return
```

It turns out that, under certain conditions, the `ipaddress` module can create
IPv6 addresses from raw bytes. My assumption is that it offers this behavior as
a convenient way to parse IP addresses from data fresh off the [wire].

Does `node.example.com` meet those certain conditions? You bet it does. Because
we're using Python 2 it's just `bytes` and it happens to be 16 characters long.

```python
>>> isinstance("node.example.com", bytes)
True
>>> # `self._check_packed_address` basically just checks how long it is.
>>> len("node.example.com") == 16
True
```

The rest of the `ipaddress` lines say to interpret the sequence of bytes as a
[big-endian][endianness] integer. That's [magic][struct unpacking] best left
for another blog post, but the gist is that hexadecimal interpretation of
`node.example.com` is condensed into a single, **huge** number.

```python
>>> int("6e6f64652e6578616d706c652e636f6d", 16)
146793460745001871434687145741037825901L
```

That's an absolutely massive number, but not so massive it won't fit within the
[IPv6 address space].

```python
>>> ip_address(146793460745001871434687145741037825901L)
IPv6Address(u'6e6f:6465:2e65:7861:6d70:6c65:2e63:6f6d')
```

As it turns out, if you're liberal in your interpretation, `node.example.com`
_can_ be an IPv6 address!

## You Will Be Reading Meanings

Obviously that's hogwash. Bizarro might be proud, but that's not what we wanted
to happen.

There's a quote about numbers which is apocryphally attributed to [W.E.B. Du
Bois], but that actually comes from [Harold Geneen]'s book,
[_Managing_][Managing].

> When you have mastered the numbers, you will in fact no longer be reading
> numbers, any more than you read words when reading a book. You will be
> reading meanings.

Having not read the book I'm probably taking the quote way out of context, but
I think it fits our situation well.

As we've seen above, we can freely convert characters to numbers and back
again. The root of our problem is that when we use Python 2 it considers text
to be bytes. There's not a deeper, inherent meaning. Maybe the bytes are meant
to be ASCII, maybe they're meant to be a long number, maybe they're meant to be
an IP address. The interpretation of those bytes is up to us.

Python 2 doesn't differentiate between bytes and text by default. In fact, the
`bytes` type is just an [alias][bytes-str-alias] for `str`.

```python
>>> bytes
<type 'str'>
>>> bytes is str
True
```

To make that even more concrete, see how Python 2 considers `n` to be the same
as this sequence of raw bytes.

```python
>>> "n" == b"\x6e"
True
```

Our Python 2 code doesn't work the way we want it to because raw bytes can have
arbitrary meaning and we haven't told it to use our intended meaning.

So now we know why Python 2 interprets `node.example.com` as an IPv6 address,
but why does Python 3 behave differently? More importantly, how can we
reconcile the two?


## 256 Characters Ought To Be Enough For Anybody

ASCII looked like a good idea in the 1960's. With decades of hindsight we
know the 256 characters afforded to us by [Extended ASCII] are insufficient to
handle all of the world's writing systems. Thus, [Unicode] was born.

There are scads of blog posts, Wikipedia articles, and technical documents that
will do a better job than I can of explaining Unicode in detail. You should
read them if you care to, but here's my gist.

Unicode is a set of character encodings. [UTF-8] is the dominant encoding.
UTF-8 overlaps with ASCII, so ASCII characters are still just one byte. To
handle the multitude of other characters, however, multiple bytes can express a
single character.

```python
>>> "n".encode("utf-8").hex()  # 1 character (U+006E), 1 byte.
'6e'
>>> "🤿".encode("utf-8").hex()  # 1 character (U+1F93F), 4 bytes.
'f09fa4bf'
>>> "悟り".encode("utf-8").hex()  # 2 characters (U+609F, U+308A), 6 bytes.
'e6829fe3828a'
```

Every programming language I know of that respects the difference between
raw bytes and Unicode text maintains a strict separation between the two
datatypes.

In Python 3 this strict separation is enabled by default. Notice that it
doesn't consider `n` and this sequence of raw bytes to be the same thing.

```python
>>> "n" == b"\x6e"
False
```

Even better, it doesn't consider `str` and `bytes` to be the same type.

```python
>>> bytes is str
False
>>> bytes
<class 'bytes'>
```

If we can get Python 2 to understand Unicode like Python 3 does, then we can
probably fix our bug.

As an aside, if you want to learn more about how to handle Unicode in Python,
check out [Ned Batchelder]'s talk on [_Pragmatic Unicode_][unipain].

## How Did We Fix It?

Python 2 does actually know about Unicode, but it considers Unicode text to
be separate from "normal" text. At some point in Python 2 history the
[`unicode`][python2-unicode] type was bolted onto the side of the language and
not enabled by default. Hard to get excited about it, but it does the trick.
At least they knew it's a pain to type `unicode()` all the time, so there's a
handy literal syntax using a `u` prefix.

```python
>>> unicode("node.example.com") == u"node.example.com"
True
```

This is _not_ the best fix, but it did in a pinch. We added a line converting
the hostname to Unicode right off the bat. We also applied the same
transformation to the line with brackets. This way we always process the
hostname as Unicode and we always return a Unicode value.

```diff
 def safe_host(host):
     """Surround `host` with brackets if it is an IPv6 address."""
+    host = u"{}".format(host)
     try:
         if ip_address(host).version == 6:
-            return "[{}]".format(host)
+            return u"[{}]".format(host)
     except ValueError:
         pass
```

Luckily for us the `u` prefix also works in Python 3 whereas `unicode()` does not
(because [all text is Unicode by default][python3-str-type], so the type has no
business existing). In Python 3 the `u` is treated as a [no-op].

The Python 2 interpreter graciously understands the `unicode` type is not just
raw `bytes`.

```python
>>> isinstance(u"node.example.com", bytes)
False
```

When we use the `unicode` type the `ipaddress` module no longer tries to
interpret `node.example.com` as `bytes` and convert those bytes to an IP
address. We get just what we expect

```python
>>> try:
...     ipaddress.ip_address(u"node.example.com")
... except ValueError as error:
...     print(error)
... 
u'node.example.com' does not appear to be an IPv4 or IPv6 address
```

and our tests pass!

```ini
✔ OK py27 in 1.728 seconds
✔ OK py36 in 2.775 seconds
✔ OK py37 in 2.717 seconds
✔ OK py38 in 2.674 seconds
✔ OK py39 in 2.506 seconds
```

## Reflection

I mentioned above that our fix wasn't the best. Given more time, how can we do
better?

<p id='drop-python2'>The first (and best) solution here is to
<a href='https://python3statement.org/'>drop Python 2 support</a>. It's 2020
now and Python 2 is officially no longer supported. The original code worked on
Python 3. The best long-term decision is to migrate the code to run on Python 3
<b>only</b> and avoid the hassle of Python 2 maintenance. Unfortunately many of
the people running this code still depend on it working on Python 2, so we'll
have to make that transition gracefully.</p>

If a migration away from Python 2 isn't possible in the near-term, the next
best thing to do is update our code so that it uses a compatibility layer like
[`future`][future] or [`six`][six]. Those libraries are designed to modernize
Python 2 and help smooth over issues like this one.

It also wouldn't hurt for us to take a page from [Alexis King]'s
[_Parse, don't validate_][parse-dont-validate] school of thought. When the
hostname enters our program via user input it should **immediately** be
converted to the `unicode` type (or maybe even an IP address type) so we don't
end up solving this problem in several different places throughout the code.

Finally, though our program doesn't currently handle any hostnames in languages
other than English, it's probably best to be thinking in Unicode anyway. Again,
it's 2020 and [internationalized domain names] like [https://Яндекс.рф][yandex]
are a thing.

If you made it this far, thanks for reading. It was fun to turn a brief
debugging session with my co-worker into a treatise on the perils of Python 2
and the value of Unicode. See you next year! 😂

[URL]: https://en.wikipedia.org/wiki/URL
[standard ports]: https://en.wikipedia.org/wiki/List_of_TCP_and_UDP_port_numbers
[port]: https://en.wikipedia.org/wiki/Port_(computer_networking)
[hostname]: https://en.wikipedia.org/wiki/Hostname
[IPv4]: https://en.wikipedia.org/wiki/IPv4#Addressing
[Python]: https://www.python.org/
[IPv6]: https://en.wikipedia.org/wiki/IPv6#Addressing
[hexadecimal]: https://en.wikipedia.org/wiki/Hexadecimal
[RFC 2732]: https://www.ietf.org/rfc/rfc2732.txt
[drop-python2]: /#drop-python2
[Bizarro World]: https://en.wikipedia.org/wiki/Bizarro_World
[ip_address]: https://github.com/python/cpython/blob/v3.9.0/Lib/ipaddress.py#L27-L54
[ASCII]: https://en.wikipedia.org/wiki/ASCII
[character encoding]: https://en.wikipedia.org/wiki/Character_encoding
[byte]: https://en.wikipedia.org/wiki/Byte
[binary]: https://en.wikipedia.org/wiki/Binary_number
[decimal]: https://en.wikipedia.org/wiki/Decimal
[octal]: https://en.wikipedia.org/wiki/Octal
[W.E.B. Du Bois]: https://en.wikipedia.org/wiki/W._E._B._Du_Bois
[Harold Geneen]: https://en.wikipedia.org/wiki/Harold_Geneen
[Managing]: https://en.wikiquote.org/wiki/Harold_Geneen
[bytes-str-alias]: https://docs.python.org/3/whatsnew/2.6.html#pep-3112-byte-literals
[Extended ASCII]: https://en.wikipedia.org/wiki/ASCII#8-bit_codes
[Unicode]: https://en.wikipedia.org/wiki/Unicode
[UTF-8]: https://en.wikipedia.org/wiki/UTF-8
[Ned Batchelder]: https://nedbatchelder.com/site/aboutned.html
[unipain]: https://nedbatchelder.com/text/unipain.html
[no-op]: https://en.wikipedia.org/wiki/NOP_(code)
[ipaddress2]: https://github.com/phihag/ipaddress/blob/v1.0.23/ipaddress.py
[curious set of lines]: https://github.com/phihag/ipaddress/blob/v1.0.23/ipaddress.py#L2026-L2031
[wire]: https://en.wikipedia.org/wiki/Wire_data
[endianness]: https://en.wikipedia.org/wiki/Endianness
[struct unpacking]: https://docs.python.org/3.9/library/struct.html#struct.unpack
[IPv6 address space]: https://en.wikipedia.org/wiki/IPv6#Larger_address_space
[python2-unicode]: https://docs.python.org/2.7/library/functions.html#unicode
[python3-str-type]: https://docs.python.org/3/library/stdtypes.html#text-sequence-type-str
[future]: https://python-future.org/
[six]: https://six.readthedocs.io/
[Alexis King]: https://lexi-lambda.github.io/about.html
[parse-dont-validate]: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
[internationalized domain names]: https://en.wikipedia.org/wiki/Internationalized_domain_name
[yandex]: https://Яндекс.рф
