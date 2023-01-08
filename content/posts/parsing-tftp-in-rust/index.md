+++
title = "Parsing TFTP in Rust"
description = "Parsing TFTP in Rust"
url = "posts/parsing-tftp-in-rust"
date = 2022-12-31T16:45:00-08:00
[taxonomies]
tags = ["Rust", "TFTP", "Networking", "Parsing", "nom"]
+++
Several years ago I did a take-home interview which asked me to write a [TFTP]
server in [Go]. The job wasn't the right fit for me, but I enjoyed the
assignment. Lately, in my spare time, I've been tinkering with a [Rust]
implementation. Here's what I've done to parse the protocol.

<!-- more -->

## Caveat Lector

It's natural to write a technical blog post like this in a somewhat
authoritative tone. However, I am not an authority. There will be mistakes.
Techniques, libraries, and even protocols change over time. Keep in mind that I
am learning too and will happily accept corrections and critiques.

## Why Rust?

Much has been written on the merits of Rust by more qualified people. I
encourage you to seek their writing and make your own decisions. For my part, I
try my best to write fast, safe, and correct code. Rust lets me be more
confident about my solutions without the baggage (and danger) of the last 40
years of C/C++. Recent [statements][memory-safe-android] and
[events][rust-linux-kernel] would seem to agree.

If you know me, you might be surprised that this is my first post on Rust since
I've been hyping up the language for the last 7 years. Better late than never.
😂

## What Is TFTP?

If you already know the ins and outs of TFTP feel free to skip to the
[type design](#type-design) or [parsing](#parsing) sections.

For those who don't know, TFTP is the [Trivial File Transfer Protocol][TFTP], a
simple means of reading and writing files over a network. Initially defined in
the early 80s, the protocol was updated by [RFC 1350] in 1992. In this post
I'll only cover RFC 1350. Extensions like [RFC 2347], which adds a 6th packet
type, won't be covered.

### Security

TFTP is _not_ a secure protocol. It offers no access controls, no
authentication, no encryption, nothing. If you're running a TFTP server assume
that any other host on the network can read the files hosted by it. You should
not run a TFTP server on the open Internet.

### Why Use TFTP?

If TFTP is old, insecure, and protocols like [HTTP] &amp; [SSH] exist, you
might wonder why you'd even bother. Fair enough. If you have other options, you
probably don't need to use it.

That said, TFTP is still widely used, especially in server and lab environments
where there are closed networks. Combined with [DHCP] and [PXE] it provides an
efficient means of [network booting] due to its small memory footprint. This is
especially important for embedded devices where memory is scarce. Additionally,
if your server supports the experimental [multicast] option with [RFC 2090],
files can be read by multiple clients concurrently.

## Protocol Overview

TFTP is implemented atop [UDP], which means it can't benefit from the
retransmission and reliability inherent in [TCP]. Clients and servers must
maintain their own connections. For this reason operations are carried out in
lock-step, requiring acknowledgement at each point, so that nothing is lost or
misunderstood.

Because files might be larger than what can fit into a single packet or even in
memory, TFTP operates on chunks of a file, which it calls "blocks". In RFC 1350
these blocks are always 512 bytes or less, but [RFC 1783] allows clients to
negotiate different sizes which might be better on a particular network.

By default, initial requests are received on port `69`, the offical port
assigned to TFTP by [IANA]. Thereafter, the rest of a transfer is continued on
a random port chosen by the server. This keeps the primary port free to receive
additional requests.

### Reading

To read a file, a client sends a read request packet. If the request is
valid, the server responds with the first block of data. The client sends an
acknowledgement of this block and the server responds with the next block of
data. The two continue this dance until there's nothing more to read.

<!-- TODO: Consider hosting the SVG's CSS locally for more control. Also, this
     is enormous in desktop browsers, experiment with some scaling... -->
<img src='rrq.svg' alt='A sequence diagram for a TFTP read request.'>

### Writing

Writing a file to a server is the inverse of reading. The client sends a write
request packet and the server responds with an acknowledgement. Then the client
sends the first block of data and the server responds with another
acknowledgement. Rinse and repeat until the full file is transferred.

<!-- TODO: Consider hosting the SVG's CSS locally for more control. Also, this
     is enormous in desktop browsers, experiment with some scaling... -->
<img src='wrq.svg' alt='A sequence diagram for a TFTP write request.'>

### Errors

Errors are a valid response to any other packet. Most, if not all, errors are
terminal. Errors are a courtesy and are neither acknowledged nor retransmitted.

## Packet Types

To cover the interactions above, RFC 1350 defines five packet types, each
starting with a different 2 byte opcode. I'll elaborate on each of them in
turn.

| Opcode | Operation                 | Abbreviation |
|--------|:--------------------------|--------------|
| 1      | [Read Request](#rrq-wrq)  | `RRQ`        |
| 2      | [Write Request](#rrq-wrq) | `WRQ`        |
| 3      | [Data](#data)             | `DATA`       |
| 4      | [Acknowledgement](#ack)   | `ACK`        |
| 5      | [Error](#error)           | `ERROR`      |

### `RRQ` / `WRQ`

Read and write requests share a representation, differing only by opcode. They
contain a filename and a mode as [null-terminated strings].

| 2 bytes | string   | 1 byte | string | 1 byte |
|:--------|:---------|:-------|:-------|:-------|
| opcode  | filename | 0      | mode   | 0      |

Here's an example of the raw bytes in an `RRQ` for a file called `foobar.txt`
in `octet` mode.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> rrq </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x01</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa5c4b;">\x00</span>"</span><span>;</span></code></pre>

And here's a `WRQ` for the same file in the same mode.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> wrq </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x02</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa5c4b;">\x00</span>"</span><span>;</span></code></pre>

#### Modes

TFTP defines modes of transfer which describe how the bytes being transferred
should be handled on the other end. There are three default modes.

| Mode     | Meaning                                                        |
|:---------|:---------------------------------------------------------------|
| netascii | 8-bit [ASCII]; specifies control characters &amp; line endings |
| octet    | raw 8-bit bytes; byte-for-byte identical on both ends          |
| mail     | email the bytes to a user; obsolete even in 1992               |

The protocol allows for other modes to be defined by cooperating hosts, but I
can't recommend that. Honestly, `octet` mode is probably sufficient for most
modern needs.

### `DATA`

Data packets contain the block number being sent and the corresponding data as
raw bytes.

| 2 bytes | 2 bytes     | n bytes   |
|:--------|:------------|:----------|
| opcode  | block &num; | data      |

Here's an example of the raw bytes in a `DATA` packet for the first block of a
transfer with the contents `Hello, World!`.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> data </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x03\x00\x01</span>Hello, World!"</span><span>;</span></code></pre>

### `ACK`

Acknowledgements need only contain the block number they correspond to.

| 2 bytes | 2 bytes     |
|:--------|:------------|
| opcode  | block &num; |

Here's an example of the raw bytes in an `ACK` packet for the first block of a
transfer.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> ack </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x04\x00\x01</span>"</span><span>;</span></code></pre>

### `ERROR`

Errors contain a numeric error code and a human-readable, null-terminated
string error message.

| 2 bytes | 2 bytes    | string        | 1 byte |
|:--------|:-----------|:--------------|:-------|
| opcode  | error code | error message | 0      |

Here's an example of the raw bytes in an `ERROR` packet for a "File not found"
error.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> error </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x05\x00\x01</span>File not found<span style="color:#fa5c4b;">\x00</span>"</span><span>;</span></code></pre>

By default, TFTP defines eight error codes. Since the error code is a 16-bit
integer there's enough space for you and your friends to define 65,528 of your
own. In practice, maybe don't.

| Value  | Meaning                                  |
|--------|:-----------------------------------------|
| 0      | Not defined, see error message (if any). |
| 1      | File not found.                          |
| 2      | Access violation.                        |
| 3      | Disk full or allocation exceeded.        |
| 4      | Illegal TFTP operation.                  |
| 5      | Unknown transfer ID.                     |
| 6      | File already exists.                     |
| 7      | No such user.                            |
| ...    | ...                                      |
| 65,535 | Go wild, do whatever.                    |


## Type Design

Now we all know entirely too much about TFTP. Let's write some code already!

Before I start parsing anything I find it helpful to design the resulting
types. Even in application code I put on my library developer hat so I'm not
annoyed by my own abstractions later.

Let's motivate this design by looking at some code that would use it.

```rust
let mut buffer = [0; 512];
let socket = UdpSocket::bind("127.0.0.1:6969")?;
let length = socket.recv(&mut buffer)?;

let data = &buffer[..length];
todo!("Get our packet out of data!");
```

In both [`std::net::UdpSocket`][std-udpsocket] and
[`tokio::net::UdpSocket`][tokio-udpsocket] the interface that we have to
work with knows nothing about packets, only raw `&[u8]` (a [slice] of
[bytes][u8]).

So, our task is to turn a `&[u8]` into something else. But what? In other
implementations I've seen it's common to think of all 5 packet types as
variations on a theme. We could follow suit, doing the Rusty thing and define
an enum.

```rust
enum Packet {
    Rrq,
    Wrq,
    Data,
    Ack,
    Error,
}
```

I might have liked my Go implemenation to look like this. If Go even had enums!
😒

This design choice has an unintended consequence though. As mentioned earlier,
`RRQ` and `WRQ` only really matter on initial request. The remainder of the
transfer isn't concerned with those variants. Even so, Rust's (appreciated)
insistence on exhaustively matching patterns would make us write code like
this.

```rust
match packet(&data)? {
    Packet::Data => handle_data(),
    Packet::Ack => handle_ack(),
    Packet::Error => handle_error(),
    _ => unreachable!("Didn't we already handle this?"),
}
```

Also, you might be tempted to use [`unreachable!`][unreachable] for such code,
but it actually _is_ reachable. An ill-behaved client could send a request
packet mid-connection and this design would allow it!

Instead, what if we were more strict with our types and split the initial
`Request` from the rest of the `Transfer`?

### Requests

Before we can talk about a `Request` we should talk about its parts. When we
talked about packet types we saw that `RRQ` and `WRQ` only differed by opcode
and the rest of the packet was the same, a `filename` and a `mode`.

A `Mode` is another natural enum, but for our purposes we'll only bother with
the `Octet` variant for now.

```rust
pub enum Mode {
    // Netascii, for completeness.
    Octet,
    // Mail, if only to gracefully send an ERROR.
}
```

As an added convenience later on we'll add a [`Display`][display] impl for
`Mode` so we can convert it to a string.

```rust
impl Display for Mode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Octet => write!(f, "octet"),
        }
    }
}
```

A `Mode` combined with a `filename` make up the "inner type", which I'll call a
`Payload` for lack of a better term. I've taken some liberties by declaring
`filename` a [`PathBuf`][pathbuf], which we'll touch on _briefly_ in the
[parsing section](#parsing).

```rust
pub struct Payload {
    pub filename: PathBuf,
    pub mode: Mode,
}
```

Now we can define a `Request` as an enum where each variant has a `Payload`.

```rust
pub enum Request {
    Read(Payload),
    Write(Payload),
}
```

### Transfers

`Request` takes care of `RRQ` and `WRQ` packets, so a `Transfer` enum needs
to take care of the remaining `DATA`, `ACK`, &amp; `ERROR` packets. Transfers
are the meat of the protocol and more complex than requests. Let's break down
each variant.

#### `Data`

The `Data` variant needs to contain the `block` number, which is 2 bytes and
fits neatly into a [`u16`][u16]. It also needs to contain the raw bytes of the
`data`. There are many ways to represent this, including using a
[`Vec<u8>`][Vec] or a [`bytes::Bytes`][Bytes]. However, I think the most
straightforward is as a `&[u8]` even though it introduces a [lifetime].

#### `Ack`

The `Ack` packet is the simplest and only needs a `block` number. We'll use a
solitary `u16` for that.

#### `Error`

The `Error` variant warrants more consideration because of the well-defined
[error codes](#error). I abhor [magic numbers] in my code, so I'll prefer to
define another enum called `ErrorCode` for those. For the `message` a
`String` should suffice.

##### `ErrorCode`

Defining an `ErrorCode` involves more boilerplate than I'd like, so I'll show
three variants and leave the remainder as an exercise for the reader.

```rust
#[derive(Copy, Clone)]
pub enum ErrorCode {
    Undefined,
    FileNotFound,
    // ...
    Unknown(u16),
}
```

The `Undefined` variant is, humorously, defined, but the `Unknown` variant I've
added here is not part of RFC 1350. It merely acts as a catch-all for the
remaining error space. Conveniently, Rust enums allow variants to contain other
data.

Because of this `Unknown` variant I didn't opt for a C-style enum like

```rust
enum ErrorCode {
    Undefined = 0,
    FileNotFound = 1,
    // ...
}
```

so we can't cast an `ErrorCode` to a `u16`.

```rust
// This explodes! 💣💥
let code = ErrorCode::Unknown(42) as u16;
```

However, we can add [`From`][from] implementations. One to convert
from an `ErrorCode` to a `u16`.

```rust
impl From<ErrorCode> for u16 {
    fn from(error_code: ErrorCode) -> Self {
        match error_code {
            ErrorCode::Undefined => 0,
            ErrorCode::FileNotFound => 1,
            // ...
            ErrorCode::Unknown(n) => n,
        }
    }
}
```

And another to convert from a `u16` to an `ErrorCode`.

```rust

impl From<u16> for ErrorCode {
    fn from(code: u16) -> Self {
        match code {
            0 => Self::Undefined,
            1 => Self::FileNotFound,
            // ...
            n => Self::Unknown(n),
        }
    }        
}
```

That way we still have a convenient method for conversions.

```rust
let code = 42;
let error: ErrorCode = code.into();
assert_eq!(error, ErrorCode::Unknown(42));
```

#### Putting It All Together

With each variant considered, we arrive at an `enum` that looks like this.

```rust
pub enum Transfer<'a> {
    Data { block: u16, data: &'a [u8] },
    Ack { block: u16 },
    Error { code: ErrorCode, message: String },
}
```

I could have defined structs to hold the inner data for each variant like I did
with `Payload` earlier, but because none of the variants had the same shape I
felt less inclined to do so.

## Parsing

Now that we have a high-level type design to match the low-level network
representation we can bridge the two by parsing. There are as many ways to
shave this [Yacc] as there were enums in our packet types, but I settled on the
[`nom`][nom] library.

### What Is nom?

nom's own [readme][nom-readme] does a better job of describing itself than I
ever could, so I'll just let it do the talking.

> nom is a parser combinators library written in Rust. Its goal is to provide
> tools to build safe parsers without compromising the speed or memory
> consumption. To that end, it uses extensively Rust's strong typing and memory
> safety to produce fast and correct parsers, and provides functions, macros
> and traits to abstract most of the error prone plumbing.

That sounds good and all, but what the heck is a parser combinator? Once again,
nom has a great [description][nom-combinators] which I encourage you to read.
The gist is that, unlike other approaches, parser combinators encourage you to
give your parsing a functional flair. You construct small functions to parse
the simplest patterns and gradually compose them to handle more complex inputs.

nom has an extra advantage in that it is byte-oriented. It uses `&[u8]` as its
base type, which makes it convenient for parsing network protocols. This is
exactly the type we receive off the wire.

### Defining Combinators

It's finally time to define some combinators and do some parsing! Even if
you're familiar with Rust, nom combinators might look more like Greek to you.
I'll explain the first one in depth to show how they work and then explain only
the more confusing parts as we go along. First, a small primer.

nom combinators return [`IResult`][iresult], a type alias for a
[`Result`][result] that's generic over three types instead of the usual two.

```rust
pub type IResult<I, O, E = Error<I>> = Result<(I, O), Err<E>>;
```

These types are the input type`I`, the output type `O`,
and the error type `E` (usually a [nom error][nom-error]). I understand this
type to mean that `I` will be parsed to produce `O` and any leftover `I` as
long as no error `E` happens. For our purposes `I` is `&[u8]` and we'll have a
couple different `O` types.

#### Null Strings

`null` references are famously a "[billion dollar mistake]" and I can't say I
like `null` any better in this protocol.

> Like all other strings, it is terminated with a zero byte.<br>
> &mdash; RFC 1350, smugly

Or, you know, just tell me how long the darn string is. You're the one who put
it in the packet... Yes, I know why you did it, but I don't have to like it. 🤪

Mercifully, the nom toolkit has everything we need to slay this beast.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">fn </span><span style="color:#8ec07c;">null_str</span><span>(</span><span style="color:#fdf4c1;">input</span><span>: </span><span style="color:#fe8019;">&amp;</span><span>[</span><span style="color:#fa5c4b;">u8</span><span>]) -&gt; IResult&lt;</span><span style="color:#fe8019;">&amp;</span><span>[</span><span style="color:#fa5c4b;">u8</span><span>], </span><span style="color:#fe8019;">&amp;</span><span style="color:#fa5c4b;">str</span><span>&gt; {
</span><span>    </span><span style="color:#fabd2f;">map_res</span><span>(
</span><span>        </span><span style="color:#fabd2f;">tuple</span><span>((</span><span style="color:#fabd2f;">take_till</span><span>(|</span><span style="color:#fdf4c1;">b</span><span>| b </span><span style="color:#fe8019;">== </span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">'<span style="color:#fa5c4b;">\x00</span>'</span><span>), </span><span style="color:#fabd2f;">tag</span><span>(</span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"<span style="color:#fa5c4b;">\x00</span>"</span><span>))),
</span><span>        |(</span><span style="color:#fdf4c1;">s</span><span>, _)| std::str::from_utf8(s),
</span><span>    )(input)
</span><span>}
</span></code></pre>

Let's work inside out to understand what `null_str` is doing.

1. [`take_till`][take-till] accepts a function (here we use a closure with `b`
   for each byte) and collects up bytes from the `input` until one of
   the bytes matches the null byte, `b'\x00'`. This gets us a `&[u8]` up until,
   _but not including_, our zero byte.

2. [`tag`][tag] here just recognizes the zero byte for completeness, but we'll
   discard it later.

3. [`tuple`][tuple] applies a tuple of parsers one by one and returns their
   results as a tuple.

4. [`map_res`][map-res] applies a function returning a [`Result`][result] over
   the result of a parser. This gives us a nice way to call a fallible function
   on the results of earlier parsing, `take_till` and `tag` in this case.

5. [`std::str::from_utf8`][from-utf-8], the fallible function inside our
   outermost closure, converts our `&[u8]` (now sans zero byte) into a Rust
   [`&str`][str], which is **not** terminated with a zero byte.

6. [`IResult<&[u8], &str>`][iresult] ties it all together at the end in
   `null_str`'s return signature returning any unmatched `&[u8]` and a `&str`
   if successful.

It's important to note that I'm taking another <u><b>huge</b></u> liberty here
by converting these bytes to a Rust string at all. Rust strings are guaranteed
to be valid [UTF-8][utf-8]. TFTP [predates UTF-8][utf-8-history], so the
protocol did not specify that these strings should be Unicode. Later, I might
look into an [`OsString`][osstring], but for now non-Unicode strings will cause
failures.

> Please, only send me UTF-8 strings.<br>
> &mdash; Me, wearily

#### Request Combinators

Since `Request` only concerns itself with the first two packet types, `RRQ` and
`WRQ` we can start parsing by matching only those opcodes. For convenience I
used the [`num-derive`][num-derive] crate to create a `RequestOpCode` enum so I
could use [`FromPrimitive::from_u16`][from-u16].

The `request_opcode` combinator uses [`map_opt`][map-opt] and
[`be_u16`][be-u16] combinators to parse a `u16` out of the `input` and pass it
to `from_u16` to construct a `RequestOpCode`.

```rust
use num_derive::FromPrimitive;
use num_traits::FromPrimitive;

#[derive(FromPrimitive)]
enum RequestOpCode {
    Rrq = 1,
    Wrq = 2,
}

fn request_opcode(input: &[u8]) -> IResult<&[u8], RequestOpCode> {
    map_opt(be_u16, RequestOpCode::from_u16)(input)
}
```

To parse a `Mode` we [`map`][nom-map] the result of
[`tag_no_case`][tag-no-case] onto our `Mode` constructor. This function would
need to be _slightly_ more complex if we were supporting more than `octet` mode
right now, but not by much.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">fn </span><span style="color:#8ec07c;">mode</span><span>(</span><span style="color:#fdf4c1;">input</span><span>: </span><span style="color:#fe8019;">&amp;</span><span>[</span><span style="color:#fa5c4b;">u8</span><span>]) -&gt; IResult&lt;</span><span style="color:#fe8019;">&amp;</span><span>[</span><span style="color:#fa5c4b;">u8</span><span>], Mode&gt; {
</span><span>    </span><span style="color:#fabd2f;">map</span><span>(</span><span style="color:#fabd2f;">tag_no_case</span><span>(</span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"octet<span style="color:#fa5c4b;">\x00</span>"</span><span>), |_| Mode::Octet)(input)
</span><span>}
</span></code></pre>

For a `Payload` we can use [`tuple`][tuple] with our `mode` combinator and
`null_str` to match our filename. We then use a provided [`Into`][into] impl to
convert our filename `&str` to a `PathBuf`.

```rust
fn payload(input: &[u8]) -> IResult<&[u8], Payload> {
    let (input, (filename, mode)) = tuple((null_str, mode))(input)?;
    Ok((
        input,
        Payload {
            filename: filename.into(),
            mode,
        },
    ))
}
```

Finally, we reach the top level of parsing and put all the rest together. The
`request` function is not, itself, a combinator, which is why you see the
[`Finish::finish`][nom-finish] calls here. We use
[`all_consuming`][all-consuming] to ensure no input remains after parsing with
`payload` and map the result to our respective `Read` and `Write` variants. We
also hide nom errors inside a [custom error](#parsing-failures).

```rust
pub fn request(input: &[u8]) -> Result<Request, ParsePacketError> {
    let iresult = match request_opcode(input).finish()? {
        (input, RequestOpCode::Rrq) => map(all_consuming(payload), Request::Read)(input),
        (input, RequestOpCode::Wrq) => map(all_consuming(payload), Request::Write)(input),
    };

    iresult
        .finish()
        .map(|(_, request)| request)
        .map_err(ParsePacketError::from)
}
```

With our combinators in order we can add a `Request::deserialize` method to our
enum to hide the implementation details, making it much easier to switch
parsing logic later if we want.

```rust
impl Request {
    pub fn deserialize(bytes: &[u8]) -> Result<Self, ParsePacketError> {
        parse::request(bytes)
    }
}
```

#### Parsing Failures

You might have wondered where that `ParsePacketError` came from. It's right
here. I used the [`thiserror`][thiserror] crate because it's invaluable when
crafting custom errors. Thanks, [`@dtolnay`][dtolnay]!

```rust
#[derive(Debug, PartialEq, thiserror::Error)]
#[error("Error parsing packet")]
pub struct ParsePacketError(nom::error::Error<Vec<u8>>);

// Custom From impl because thiserror's #[from] can't tranlate this for us.
impl From<nom::error::<&[u8]>> for ParsePacketError {
    fn from(err: nom::error::Error<&[u8]>) -> Self {
        ParsePacketError(nom::error::Error::new(err.input.to_vec(), err.code))
    }
}
```

You might also wonder why I converted from the original
`nom::error::Error<&[u8]>` to `nom::error::Error<Vec<u8>>`. Apparently
[`std::error::Error::source()`][error-source] requires errors to be
`dyn Error + 'static`, so non-[static lifetimes][static-lifetimes] aren't
allowed if you want to provide a backtrace, which I might like to do at some
point. Also, it just seems reasonable for an `Error` type to own its data.

While we were careful to split up our `Request` and `Transfer` types I didn't
see a whole lot of benefit in having separate error types, so I reused
`ParsePacketError` for `Transfer` as well.


#### Transfer Combinators

The `Transfer` combinators are very similar to what we did for `Request`. The
opcode handling is basically the same, but with different numeric values so we
can't accidentally parse any other opcodes.

```rust
use num_derive::FromPrimitive;
use num_traits::FromPrimitive;

#[derive(FromPrimitive)]
enum TransferOpCode {
    Data = 3,
    Ack = 4,
    Error = 5,
}

fn transfer_opcode(input: &[u8]) -> IResult<&[u8], TransferOpCode> {
    map_opt(be_u16, TransferOpCode::from_u16)(input)
}
```

For `Data` we just peel off the `u16` block number and then retain the
[`rest`][rest] as the original `&[u8]`. The type alias here isn't necessary,
but I like to do small things like this for organizational purposes.

```rust
type Data<'a> = (u16, &'a [u8]);

fn data(input: &[u8]) -> IResult<&[u8], Data> {
    tuple((be_u16, rest))(input)
}
```

`Ack` is, once again, the simplest. Just a named wrapper around [`be_u16`][be-u16].

```rust
type Ack = u16;

fn ack(input: &[u8]) -> IResult<&[u8], Ack> {
    be_u16(input)
}
```

The `Error` variant is nearly as simple, but we need a call to
[`Result::map`][result-map] to call [`Into`][into] impls and convert `code`
from `u16` to `ErrorCode` and `message` from `&str` to `String`.

```rust
type Error = (ErrorCode, String);

fn error(input: &[u8]) -> IResult<&[u8], Error> {
    tuple((be_u16, null_str))(input)
        .map(|(input, (code, message))| (input, (code.into(), message.into())))
}
```

When we put it all these combinators together in a `transfer` function it looks
more complex than our earlier `request` function. That's only because there
are more variants and my choice to use anonymous struct variants instead of
tuple structs means there's no easy constructor, so we map over a closure.
Otherwise the idea is the same as before.
 
```rust
pub fn transfer(input: &[u8]) -> Result<Transfer, ParsePacketError> {
    let iresult = match opcode(input).finish()? {
        (input, TransferOpCode::Data) => map(all_consuming(data), |(block, data)| {
            Transfer::Data { block, data }
        })(input),
        (input, TransferOpCode::Ack) => {
            map(all_consuming(ack), |block| Transfer::Ack { block })(input)
        }
        (input, TransferOpCode::Error) => map(all_consuming(error), |(code, message)| {
            Transfer::Error { code, message }
        })(input),
    };

    iresult
        .finish()
        .map(|(_, transfer)| transfer)
        .map_err(ParsePacketError::from)
}
```

Just like with `Request` we create a `Transfer::deserialize` method to hide
these parsing details from the rest of our code.

```rust
impl<'a> Transfer<'a> {
    pub fn deserialize(bytes: &'a [u8]) -> Result<Self, ParsePacketError> {
        parse::transfer(bytes)
    }
}
```

## Serialization

We can now read bytes into packets, which is handy, but astute readers will
have noticed that you need to do the reverse if you're going to have a full
TFTP conversation. Luckily, this serialization is (mostly) infallible, so
there's less to explain.

I used [`BytesMut`][bytes-mut] because I was already using the
[`bytes`][bytes] crate for the extension methods on the [`BufMut`][buf-mut]
trait like [`put_slice`][put-slice]. Plus, this way I avoid an accidental panic
if I pass a `&mut [u8]` and forget to size it appropriately.

### Serializing `Request`

Serializing a `Request` packet is deceptively straightfoward. We use a `match`
expression to pull our `Payload` out of the request and associate with a
`RequestOpCode`. Then we just serialize the opcode as a `u16` with
[`put_u16`][put-u16]. The `filename` and `mode` we serialize as null-terminated
strings using a combo of [`put_slice`][put-slice] and [`put_u8`][put-u8].

```rust
impl Request {
    pub fn serialize(&self, buffer: &mut BytesMut) {
        let (opcode, payload) = match self {
            Request::Read(payload) => (RequestOpCode::Rrq, payload),
            Request::Write(payload) => (RequestOpCode::Wrq, payload),
        };

        buffer.put_u16(opcode as u16);
        buffer.put_slice(payload.filename.to_string_lossy().as_bytes());
        buffer.put_u8(0x0);
        buffer.put_slice(payload.mode.to_string().as_bytes());
        buffer.put_u8(0x0);
    }
}
```

Converting our `mode` with [`as_bytes`][as-bytes] through a
[`to_string`][to-string] is possible thanks to our earlier [`Display`][display]
impl for `Mode`. The `filename` conversion to bytes through `PathBuf`'s
[`to_string_lossy`][to-string-lossy] might reasonably raise some eyebrows.
Unlike strings a Rust path is not guaranteed to be UTF-8, so any non-Unicode
characters will be replaced with [� (U+FFFD)][replacement-character]. For now,
given my earlier Unicode decision I'm comfortable with this, but a more robust
method is desirable.

### Serializing `Transfer`

Serializing a `Transfer` packet is more straightforward.

```rust
impl Transfer<'_> {
    pub fn serialize(&self, buffer: &mut BytesMut) {
        match *self {
            Self::Data { block, data } => {
                buffer.put_u16(TransferOpCode::Data as u16);
                buffer.put_u16(block);
                buffer.put_slice(data);
            }
            Self::Ack { block } => {
                buffer.put_u16(TransferOpCode::Ack as u16);
                buffer.put_u16(block);
            }
            Self::Error { code, ref message } => {
                buffer.put_u16(TransferOpCode::Error as u16);
                buffer.put_u16(code.into());
                buffer.put_slice(message.as_bytes());
                buffer.put_u8(0x0);
            }
        }
    }
}
```

As before, with each variant we serialize a `u16` for the `TransferOpCode` and then do
variant-specific serialization.

- For `Data` we serialize a `u16` for the block number and then the
  remainder of the data.
- For `Ack` we also serialize a `u16` block number.
- For `Error` we use our [`From`][from] impl from earlier to serialize the
  `ErrorCode` as a `u16` and then serialize the `message` as a null-terminated
  string.

That's it! Now we can read and write structured data to and from raw bytes! 🎉

## Tests

A post on parsing wouldn't be complete without some tests showing that our code
works as expected. First, we'll use the marvelous [`test-case`][test-case]
crate to bang out a few negative tests on things we expect to be errors.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span>#[</span><span style="color:#fdf4c1;">test_case</span><span>(</span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"<span style="color:#fa5c4b;">\x00</span>"</span><span> ; </span><span style="color:#b8bb26;">"too small"</span><span>)]
</span><span>#[</span><span style="color:#fdf4c1;">test_case</span><span>(</span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"<span style="color:#fa5c4b;">\x00\x00</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa5c4b;">\x00</span>"</span><span> ; </span><span style="color:#b8bb26;">"too low"</span><span>)]
</span><span>#[</span><span style="color:#fdf4c1;">test_case</span><span>(</span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"<span style="color:#fa5c4b;">\x00\x03</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa4c4b;">\x00</span>"</span><span> ; </span><span style="color:#b8bb26;">"too high"</span><span>)]
</span><span style="color:#fa5c4b;">fn </span><span style="color:#8ec07c;">invalid_request</span><span>(</span><span style="color:#fdf4c1;">input</span><span>: </span><span style="color:#fe8019;">&amp;</span><span>[</span><span style="color:#fa5c4b;">u8</span><span>]) {
</span><span>    </span><span style="color:#fa5c4b;">let</span><span> actual </span><span style="color:#fe8019;">= </span><span>Request::deserialize(input);
</span><span>    </span><span style="font-style:italic;color:#928374;">// We don't care about the nom details, so ignore them with ..
</span><span>    </span><span style="color:#fabd2f;">assert!</span><span>(</span><span style="color:#fabd2f;">matches!</span><span>(actual, </span><span style="color:#fabd2f;">Err</span><span>(ParsePacketError(</span><span style="color:#fe8019;">..</span><span>))));
</span><span>}
</span></code></pre>

And, for good measure, we'll show that we can round-trip an `RRQ` packet from
raw bytes with a stop at a proper enum in between.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span>#[</span><span style="color:#fdf4c1;">test</span><span>]
</span><span style="color:#fa5c4b;">fn </span><span style="color:#8ec07c;">roundtrip_rrq</span><span>() -&gt; </span><span style="color:#fabd2f;">Result</span><span>&lt;(), ParsePacketError&gt; {
</span><span>    </span><span style="color:#fa5c4b;">let</span><span> before </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b</span><span style="color:#b8bb26;">"<span style="color:#fa5c4b;">\x00\x01</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa5c4b;">\x00</span>"</span><span>;
</span><span>    </span><span style="color:#fa5c4b;">let</span><span> expected </span><span style="color:#fe8019;">= </span><span>Request::Read(Payload {
</span><span>        filename: </span><span style="color:#b8bb26;">"foobar.txt"</span><span>.</span><span style="color:#fabd2f;">into</span><span>(),
</span><span>        mode: Mode::Octet,
</span><span>    });
</span><span>    
</span><span>    </span><span style="color:#fa5c4b;">let</span><span> packet </span><span style="color:#fe8019;">= </span><span>Request::deserialize(before)</span><span style="color:#fe8019;">?</span><span>;
</span><span>    </span><span style="font-style:italic;color:#928374;">// Use an under-capacity buffer to test panics.
</span><span>    </span><span style="color:#fa5c4b;">let mut</span><span> after </span><span style="color:#fe8019;">= </span><span>BytesMut::with_capacity(</span><span style="color:#d3869b;">4</span><span>);
</span><span>    packet.</span><span style="color:#fabd2f;">serialize</span><span>(</span><span style="color:#fe8019;">&amp;</span><span style="color:#fa5c4b;">mut</span><span> after);
</span><span>    
</span><span>    </span><span style="color:#fabd2f;">assert_eq!</span><span>(packet, expected);
</span><span>    </span><span style="color:#fabd2f;">assert_eq!</span><span>(</span><span style="color:#fe8019;">&amp;</span><span>before[</span><span style="color:#fe8019;">..</span><span>], after);
</span><span>}
</span></code></pre>

Unless you want to copy/paste all this code you'll have to trust me that the
tests pass. 😉 Don't worry, I've written many more tests, but this is a blog
post, not a test suite, so I'll spare you the details.

## `Ack`nowledgements

Wow. You actually read all the way to the end. Congrats, and more importantly,
thank you! 🙇‍♂️ 

All of the work above is part of a personal project I chip away at
in my spare time, but I don't do it alone. I owe a huge debt of gratitude to my
friend &amp; Rust mentor, [Zefira], who has spent countless hours letting me
pick her brain on every minute detail of
this TFTP code. I could not have written this blog post without her!

I also need to thank Yiannis M ([`@oblique`][oblique]) for their work on the
[`async-tftp-rs`][async-tftp-rs] crate, from which I have borrowed liberally
and learned a great deal. You may recognize some combinators if you dive into
that code.

Finally, I can't thank my wife enough helping me edit this. There are many
fewer mistakes as a result.

The source code for the rest of the project is not currently public, but when
I'm more confident in it I'll definitely share more details. Meanwhile, I
welcome any and all suggestions on how to make what I've written here more
efficient and safe.

<!-- TODO: Pin crates.io links to specific versions? -->

[Go]: https://go.dev/
[TFTP]: https://en.wikipedia.org/wiki/Trivial_File_Transfer_Protocol
[DHCP]: https://en.wikipedia.org/wiki/Dynamic_Host_Configuration_Protocol
[PXE]: https://en.wikipedia.org/wiki/Preboot_Execution_Environment
[network booting]: https://en.wikipedia.org/wiki/Network_booting
[multicast]: https://en.wikipedia.org/wiki/Multicast
[RFC 2090]: https://www.rfc-editor.org/rfc/rfc2090
[Rust]: https://www.rust-lang.org/
[memory-safe-android]: https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html
[rust-linux-kernel]: https://lwn.net/Articles/910762/
[RFC 1350]: https://www.rfc-editor.org/rfc/rfc1350
[RFC 2347]: https://www.rfc-editor.org/rfc/rfc2347
[RFC 1783]: https://www.rfc-editor.org/rfc/rfc1783
[IANA]: https://en.wikipedia.org/wiki/Internet_Assigned_Numbers_Authority
[HTTP]: https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol
[SSH]: https://en.wikipedia.org/wiki/Secure_Shell
[UDP]: https://en.wikipedia.org/wiki/User_Datagram_Protocol
[TCP]: https://en.wikipedia.org/wiki/Transmission_Control_Protocol
[ASCII]: https://en.wikipedia.org/wiki/ASCII
[null-terminated strings]: https://en.wikipedia.org/wiki/Null-terminated_string
[std-udpsocket]: https://doc.rust-lang.org/std/net/struct.UdpSocket.html
[tokio-udpsocket]: https://docs.rs/tokio/1.23.0/tokio/net/struct.UdpSocket.html
[slice]: https://doc.rust-lang.org/std/primitive.slice.html
[unreachable]: https://doc.rust-lang.org/std/macro.unreachable.html
[pathbuf]: https://doc.rust-lang.org/std/path/struct.PathBuf.html
[u16]: https://doc.rust-lang.org/std/primitive.u16.html
[u8]: https://doc.rust-lang.org/std/primitive.u8.html
[lifetime]: https://doc.rust-lang.org/rust-by-example/scope/lifetime.html
[magic numbers]: https://en.wikipedia.org/wiki/Magic_number_(programming)
[from]: https://doc.rust-lang.org/std/convert/trait.From.html
[Yacc]: https://en.wikipedia.org/wiki/Yacc
[nom]: https://crates.io/crates/nom
[nom-readme]: https://github.com/rust-bakery/nom/blob/6860641f1b003781f9dc1a91d0f631ff17400d1b/README.md
[nom-combinators]: https://github.com/rust-bakery/nom/blob/6860641f1b003781f9dc1a91d0f631ff17400d1b/README.md#parser-combinators
[billion dollar mistake]: https://www.infoq.com/presentations/Null-References-The-Billion-Dollar-Mistake-Tony-Hoare/
[take-till]: https://docs.rs/nom/7.1.1/nom/bytes/complete/fn.take_till.html
[tag]: https://docs.rs/nom/7.1.1/nom/bytes/complete/fn.tag.html
[tuple]: https://docs.rs/nom/7.1.1/nom/sequence/fn.tuple.html
[map-res]: https://docs.rs/nom/7.1.1/nom/combinator/fn.map_res.html
[result]: https://doc.rust-lang.org/core/result/enum.Result.html
[from-utf-8]: https://doc.rust-lang.org/std/str/fn.from_utf8.html
[str]: https://doc.rust-lang.org/std/primitive.str.html
[iresult]: https://docs.rs/nom/7.1.1/nom/type.IResult.html
[nom-error]: https://docs.rs/nom/7.1.1/nom/error/struct.Error.html
[utf-8]: https://en.wikipedia.org/wiki/UTF-8
[utf-8-history]: https://en.wikipedia.org/wiki/UTF-8#History
[osstring]: https://doc.rust-lang.org/std/ffi/struct.OsString.html
[num-derive]: https://crates.io/crates/num-derive
[from-u16]: https://docs.rs/num-traits/0.2.15/num_traits/cast/trait.FromPrimitive.html#method.from_u16
[map-opt]: https://docs.rs/nom/7.1.1/nom/combinator/fn.map_opt.html
[be-u16]: https://docs.rs/nom/7.1.1/nom/number/complete/fn.be_u16.html
[nom-map]: https://docs.rs/nom/7.1.1/nom/combinator/fn.map.html
[tag-no-case]: https://docs.rs/nom/7.1.1/nom/bytes/complete/fn.tag_no_case.html
[into]: https://doc.rust-lang.org/std/convert/trait.Into.html
[nom-finish]: https://docs.rs/nom/7.1.1/nom/trait.Finish.html#tymethod.finish
[all-consuming]: https://docs.rs/nom/7.1.1/nom/combinator/fn.all_consuming.html
[thiserror]: https://crates.io/crates/thiserror
[dtolnay]: https://github.com/dtolnay
[error-source]: https://doc.rust-lang.org/std/error/trait.Error.html#method.source
[static-lifetimes]: https://doc.rust-lang.org/rust-by-example/scope/lifetime/static_lifetime.html
[rest]: https://docs.rs/nom/7.1.1/nom/combinator/fn.rest.html
[result-map]: https://doc.rust-lang.org/std/result/enum.Result.html#method.map
[bytes-mut]: https://docs.rs/bytes/1.3.0/bytes/struct.BytesMut.html
[buf-mut]: https://docs.rs/bytes/1.3.0/bytes/trait.BufMut.html
[bytes]: https://crates.io/crates/bytes
[put-u16]: https://docs.rs/bytes/1.3.0/bytes/trait.BufMut.html#method.put_u16
[put-slice]: https://docs.rs/bytes/1.3.0/bytes/trait.BufMut.html#method.put_slice
[put-u8]: https://docs.rs/bytes/1.3.0/bytes/trait.BufMut.html#method.put_u8
[display]: https://doc.rust-lang.org/std/fmt/trait.Display.html
[as-bytes]: https://doc.rust-lang.org/std/string/struct.String.html#method.as_bytes
[to-string]: https://doc.rust-lang.org/std/string/trait.ToString.html#tymethod.to_string
[to-string-lossy]: https://doc.rust-lang.org/std/path/struct.PathBuf.html#method.to_string_lossy
[replacement-character]: https://doc.rust-lang.org/std/char/constant.REPLACEMENT_CHARACTER.html
[Vec]: https://doc.rust-lang.org/std/vec/struct.Vec.html
[Bytes]: https://docs.rs/bytes/1.3.0/bytes/struct.Bytes.html
[test-case]: https://crates.io/crates/test-case
[Zefira]: https://zefira.dev/
[oblique]: https://github.com/oblique
[async-tftp-rs]: https://crates.io/crates/async-tftp
