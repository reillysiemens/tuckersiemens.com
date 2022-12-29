+++
title = "Parsing TFTP in Rust"
description = "TODO"
url = "posts/parsing-tftp-in-rust"
date = 2022-12-31T00:00:00-08:00
[taxonomies]
tags = ["Rust", "TFTP", "Networking", "parsing", "nom"]
+++
Several years ago I did a take-home interview which asked me to write a [TFTP]
server in [Go]. I decided the job wasn't the right fit for me at the time, but
the assignment and the protocol have stuck with me. Lately, in my spare time,
I've been tinkering with a [Rust] implementation.

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
I've been aggressively shilling the language for the last 7 years. 😂

## What Is TFTP?

TFTP is the [Trivial File Transfer Protocol][TFTP]. The basic protocol is
currently defined by [RFC 1350]. In this post I'll focus only on the base
protocol and none of its extensions (like [RFC 1782], which adds a 6th packet
type). A production-ready TFTP server would involve more than what is written
here.

- Basic protocol overview
- "lockstep protocol"
- UDP
- State machine diagram here?

### A Note On Security

TODO...

### Why Use TFTP?

TODO...

- DHCP
- PXE
- Multicast
- Imaging large numbers of machines on a local network.

## Packet Types

RFC 1350 defines five packet types, given in the table below. I'll elaborate on
each of them in turn.

| Opcode | Operation       | Abbreviation |
|--------|:----------------|--------------|
| 1      | Read Request    | `RRQ`        |
| 2      | Write Request   | `WRQ`        |
| 3      | Data            | `DATA`       |
| 4      | Acknowledgement | `ACK`        |
| 5      | Error           | `ERROR`      |

### `RRQ` / `WRQ`

Read and write requests share a representation, differing only by opcode. They
contain a filename and a mode as [null-terminated strings].

| 2 bytes | string   | 1 byte | string | 1 byte |
|:--------|:---------|:-------|:-------|:-------|
| opcode  | filename | 0      | mode   | 0      |

Here's an example of the raw bytes in an `RRQ` for a file called `foobar.txt`
in `octet` mode.

<pre class="language-rust" data-lang="rust" style="background-color:#282828;color:#fdf4c1aa;"><code class="language-rust" data-lang="rust"><span style="color:#fa5c4b;">let</span><span> rrq </span><span style="color:#fe8019;">= </span><span style="color:#b8bb26;">b"<span style="color:#fa5c4b;">\x00\x01</span>foobar.txt<span style="color:#fa5c4b;">\x00</span>octet<span style="color:#fa5c4b;">\x00</span>"</span><span>;</span></code></pre>

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

By default, TFTP defines eight error types. Since the error code is a 16-bit
integer there's enough space for you and your friends to define 65,528 of your
own. In practice, maybe don't.

| Value    | Meaning                                  |
|----------|:-----------------------------------------|
| 0        | Not defined, see error message (if any). |
| 1        | File not found.                          |
| 2        | Access violation.                        |
| 3        | Disk full or allocation exceeded.        |
| 4        | Illegal TFTP operation.                  |
| 5        | Unknown transfer ID.                     |
| 6        | File already exists.                     |
| 7        | No such user.                            |
| &hellip; | &hellip;                                 |
| 65,535   | Go wild, do whatever.                    |


## Type Design

Before I start parsing anything I find it helpful to try to design the
resulting types. That informs both how I expect to use the types in my
application code and my parsing machinery.

Let's motivate this design by looking at the code that would use it.

- Showcase `tokio` UDP socket send/recv code.
- Talk about `Request` vs. `Transfer` split.

TODO...

## Parsing

TODO...

### What Is nom?

TODO...

### What Are Parser Combinators?

TODO...

[Go]: https://go.dev/
[TFTP]: https://en.wikipedia.org/wiki/Trivial_File_Transfer_Protocol
[Rust]: https://www.rust-lang.org/
[memory-safe-android]: https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html
[rust-linux-kernel]: https://lwn.net/Articles/910762/
[RFC 1350]: https://www.rfc-editor.org/rfc/rfc1350
[RFC 1782]: https://www.rfc-editor.org/rfc/rfc1782
[null-terminated strings]: https://en.wikipedia.org/wiki/Null-terminated_string
