+++
title = "Parsing TFTP in Rust"
description = "TODO"
url = "posts/parsing-tftp-in-rust"
date = 2022-12-31T00:00:00-08:00
[taxonomies]
tags = ["Rust", "parsing", "TFTP", "nom", "Networking"]
+++
Lolwut.

<!-- more -->

## Why Rust?

Many reasons.

## What Is TFTP?

TFTP is the [Trivial File Transfer Protocol][TFTP]. It is currently defined by [RFC 1350].

- Basic protocol overview
- "lockstep protocol"
- UDP

## What Is nom?

### What Are Parser Combinators?

## Parsing TFTP

OK, so we know what TFTP is and what nom is. Let's put the two together.

### Packet Types

Packets exist, yo.

| opcode | operation       | abbreviation |
|--------|:----------------|--------------|
| 1      | Read Request    |`RRQ`         |
| 2      | Write Request   | `WRQ`        |
| 3      | Data            | `DATA`       |
| 4      | Acknowledgement | `ACK`        |
| 5      | Error           | `ERROR`      |

#### `RRQ` / `WRQ`

Read and write requests share a representation, differing only by opcode. They
contain a filename and a mode.

TODO: Talk about filename length and modes as an enum.

| 2 bytes | string   | 1 byte | string | 1 byte |
|---------|----------|--------|--------|--------|
| opcode  | filename | 0      | mode   | 0      |

#### `DATA`

Data packets contain the block number being sent and the corresponding data as
raw bytes.

| 2 bytes | 2 bytes     | `n` bytes |
|---------|-------------|-----------|
| opcode  | block &num; | data      |

#### `ACK`

Acknowledgements need only contain the block number they correspond to.

| 2 bytes | 2 bytes     |
|---------|-------------|
| opcode  | block &num; |

#### `ERROR`

Errors contain a numeric error code and a human-readable error message.

| 2 bytes | 2 bytes    | string        | 1 byte |
|---------|------------|---------------|--------|
| opcode  | error code | error message | 0      |

[TFTP]: https://en.wikipedia.org/wiki/Trivial_File_Transfer_Protocol
[RFC 1350]: https://www.rfc-editor.org/rfc/rfc1350
