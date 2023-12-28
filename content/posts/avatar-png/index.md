+++
title = "avatar.png"
description = "TODO"
url = "posts/avatar.png"
date = 2023-10-12T00:00:00-08:00
[taxonomies]
tags = ["Rust", "PHP", "webdev", "PNG"]
+++

No, not that Avatar. And not the other one either.

`TODO: Is this even a good title?`

`TODO: Don't forget to add a summary. Should probably just be a portion of the
intro paragraph.`

<!-- more -->

`TODO: Fix image container. Figcaption?`
<div style="display: flex; align-items: center; justify-content: center;">
  <img style="height: 256px; width:256px;" src="avatar.png" height="256" width="256" alt="TODO">
</div>

These files are web applications that generate PNGs on request containing a
friendly greeting with the IP address of the requester.

The PHP was originally written by Andrew Kvalheim probably around 2010. Its
filename at that time was avatar.png, so as to give the illusion that it was a
static file.

Used for Skype (I think? what else?) chat between university employees. Would
accept a URL for a profile picture. Image was fetched by the client. It might
have been hosted on a student web service allowed to run PHP.

Taught me the valuable lesson that file extensions are a lie, the web can do
whatever the heck it wants, and `Content-Type` is king.

There was magic in discovering the computer could be bent to one's whim
dynamically like this.

Child-like wonderment.

# PHP

`TODO: Which version of PHP would have been used? Spring-Summer 2010? Probably
some version of Ubuntu and Apache with mod PHP. Is it possible to run a similar
server for local testing during this post?`

``TODO: Does this load `UbuntuMono-Regular.ttf` on each request? According to the
docs it sure looks like it. How big is that file? What's the perf cost to load
it? Can I verify with `strace` or `dtrace` or some such? Or just do a quick
walkthrough of the PHP source code?``

```php
<?php

    //Get IP address
    $ip = explode('.' $_SERVER['REMOTE_ADDR'], 4);

    //Render image
    $image = @imagecreate(256, 256)
        or die("Cannot Initialize new GD image stream");
    $background_color = imagecolorallocate($image, 119, 41, 83);
    $text_color = imagecolorallocate($image, 255, 255, 255);
    imagettftext($image, 24, 0, 8, 96, $text_color, 'UbuntuMono-Regular.ttf', "Hello, \n$ip[0].$ip[1].$ip[2].$ip[3]!");

    //Send response
    header('Content-Type: image/png');
    imagepng($image);
    imagedestroy($image);
?>
```

Buckle up, 'cuz we're gonna do a bit of everything. Old code, new code, and a
bit of lore in between.

- [server] &mdash; ``TODO: Talk about the magic that is `$_SERVER`. How does that handle IPv6 now?``
- [explode] &mdash; ``TODO: what is the history of this function name? Does it actually have to do with function name length? Is this call missing a `,`? Also, why bother with this? Is `$_SERVER['REMOTE_ADDR']` not a string already?``
- [imagecreate] &mdash; ``TODO: what is GD? Why on earth is the `@` sigil used?` Apparently it's for error suppression. https://www.php.net/manual/en/language.operators.errorcontrol.php``
- [die] &mdash; ``TODO: why is this called `die`? What happens if it dies? 500 Internal Server Error? `exit()` the program?``
- [imagecolorallocate] &mdash; `TODO: Why does this fill in the background?`
- [imagettftext] &mdash; `TODO: How does this handle newlines?`
- [header] &mdash; `TODO: Is order important? Looks like yes from docs!`
- [imagepng] &mdash; `TODO: What is this magic? No return value? Just stream it?`
- [imagedestroy] &mdash; `TODO: Why is this even necessary?`

``TODO: Might be worth noting that a lot of this comes from the first
`imagecreate` example. A good example of copying what you need and adapting it
to your purposes. As we become more experienced software engineers we often
think it needs to be just so, but there's real benefit from just grabbing what
you find and using it, especially for low-stakes fun.``

`TODO: How are all of these things magically in scope?`

# Rust

`Ok`. Let's set some ground rules.

1. I like it when blog posts build up solutions, showing mistakes and oddities
   on the way. If you want to skip all that, here's the
   [finished production code].

2. I'm assuming a basic level of Rust understanding. I don't expect you to have
   read [The Book] cover to cover, but I won't annotate each line in detail
   either.

3. As I translate this, keep in mind that PHP is a language made for the web.
   I'm not competing for brevity and certainly not trying to play [code golf].
   The Rust code **will** be longer.

4. I'll cut some corners in the initial implementation for the sake of
   understanding, but try to come back and make everything tidy by the end.

## Choosing A Framework

The original PHP was likely run in [Apache] using [mod_php], which appears to
be out of style these days. In Rust we often don't run a separate server like
Apache or [Nginx]. Instead the application and server are compiled into the
same binary and we choose between frameworks. I've been enjoying [Axum] lately,
so that's what I used, but I'm sure [Actix] or [Rocket] would have been fine
too.

First, we create a new Rust project and add our dependencies.

`TODO: Upgrade Axum to 0.7.2`

```bash
$ cargo new avatar && cd avatar
$ cargo add axum@0.7.1
$ cargo add tokio@1.34.0 --features=rt-multi-thread,macros
```

Then, we add Axum's ["Hello, World!"][hello_world] example to `src/main.rs` and
build up from there.

```rust
use axum::{routing::get, Router};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(|| async { "Hello, World!" }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Getting the IP

Going off the PHP example, the first thing to do is replicate the behavior of
`$_SERVER['REMOTE_ADDR']` and get the IP address of the client connecting to
the server. PHP [automagically] populates `$_SERVER` with this information, but
Axum wants us to be clear about our needs, so this gets a bit more complicated
right away.

```rust
use axum::{extract::ConnectInfo, routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    let app = Router::new().route(
        "/",
        get(|ConnectInfo(addr): ConnectInfo<SocketAddr>| async move {
            format!("Hello, {}!", addr.ip())
        }),
    );

    let make_service = app.into_make_service_with_connect_info::<SocketAddr>();
    axum::serve(listener, make_service).await.unwrap();
}
```

Axum also exposes connection information, but not quite as automagically. This
information is given to a [handler] (the [closure] we give to
[`get`][axum_routing_get]) via an [extractor]. If that all sounds very
abstract, it's because it is.

Specifically, we use the [`ConnectInfo<T>`][axum_extract_connectinfo] extractor
as an argument to our closure and destructure it to get a
[`SocketAddr`][socket_addr] (the desired `T`). These types can't be inferred,
so our handler arguments get a bit verbose. This extractor also requires we
create our app using
[`into_make_service_with_connect_info<C>`][into_make_service_with_connect_info]
, which is a long way of saying "let my app get connection info". That behavior
is not enabled by default.

Astute readers will have noticed that we also added the [`move`][move] keyword
to our [`async` block][async_block]. Without this our friendly compiler
steps in to give a lecture on [borrowing and ownership].

`TODO: Should this section get colored like the compiler output?`

```
error[E0373]: async block may outlive the current function, but it borrows `addr`, which is owned by the current function
  --> src/main.rs:8:58
   |
8  |           get(|ConnectInfo(addr): ConnectInfo<SocketAddr>| async {
   |  __________________________________________________________^
9  | |             format!("Hello, {}!", addr.ip())
   | |                                   ---- `addr` is borrowed here
10 | |         }),
   | |_________^ may outlive borrowed value `addr`
   |
note: async block is returned here
  --> src/main.rs:8:58
   |
8  |           get(|ConnectInfo(addr): ConnectInfo<SocketAddr>| async {
   |  __________________________________________________________^
9  | |             format!("Hello, {}!", addr.ip())
10 | |         }),
   | |_________^
help: to force the async block to take ownership of `addr` (and any other referenced variables), use the `move` keyword
   |
8  |         get(|ConnectInfo(addr): ConnectInfo<SocketAddr>| async move {
   |                                                                ++++

For more information about this error, try `rustc --explain E0373`.
```

What we've written expects the closure to capture `addr` by reference. However,
the compiler knows that Axum/Tokio will let the `async` block outlive the
closure itself, thus invalidating the reference. Thankfully, it warns us and
tells us what to do. So helpful! 😎

`TODO: Double check the correctness of the above statement.`

The other way to get around this is to make our handler a function instead of a
closure.

```rust
async fn root(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> String {
    format!("Hello, {}", addr.ip())
}
```

This also makes our app declaration prettier, so let's go with that.

```rust
let app = Router::new().route("/", get(root));
```

We can verify this works as intended with `curl`.

```bash
$ curl http://localhost:3000/
Hello, 127.0.0.1!
```

## Creating a PNG

Unfortunately, the assignment wasn't to return the client's IP address in
plaintext. For parity with the PHP we need to serve an image. Fortunately, the
[image] crate exists.

```bash
$ cargo add image@0.24.7
```

``TODO: Note the admirable use of generics in the `image` types.``

### Background

The image crate allows us to create a PNG in a fashion similar to the PHP. The
analog of `@imagecreate` is to create an [`ImageBuffer`][image_buffer]. Instead
of `imagecolorallocate`, the `ImageBuffer` struct has a convenient
[`from_pixel`][image_buffer_from_pixel] method which allows us to specify a
starting pixel that is then copied across our new canvas. We can start with a
single [`Rgb`][image_rgb] pixel.

```rust
use image::{ImageBuffer, Rgb};

const WIDTH: u32 = 256;
const HEIGHT: u32 = WIDTH;
const BACKGROUND_COLOR: Rgb<u8> = Rgb([177, 98, 134]);

// ...

let img = ImageBuffer::from_pixel(WIDTH, HEIGHT, BACKGROUND_COLOR);
```

### File Format

The resulting image buffer is not yet an image though. It's pretty much still a
multi-dimensional array of integers. To construct a PNG someone can actually
see we need to jam those integers into the [PNG file format]. Sadly for us, the
equivalent of PHP's `imagepng` is nowhere near as convenient.

If you use `ImageBuffer`'s [`save`][image_buffer_save] method to write the
buffer out as a file

```rust
img.save("avatar.png").unwrap();
```

you'll get a blank canvas like this.

`TODO: Fix image container. Figcaption?`
<div style="display: flex; align-items: center; justify-content: center;">
  <img style="height: 256px; width:256px;" src="blank-canvas.png" height="256" width="256" alt="TODO: Add blank canvas PNG">
</div>

Sure enough, that's a PNG, but using `save` is disastrous to us for a few
reasons.

- The image is written to the filesystem. To serve its contents to the client
   we'd have to read it from disk, which is **SLOW**.

-  Even if it wasn't slow we'd have concurrency issues. Clients could encounter
   half-written images or incorrect IP addresses from other clients.

- Even if the above weren't issues, the `save` method is written to assume
   synchronous I/O and Axum is an asynchronous web framework. We'd need to
   spawn a [background task][spawn_blocking] to keep it from blocking others.

Instead, `ImageBuffer` has a [`write_to`][image_buffer_write_to] method which
> [w]rites the buffer to a writer in the specified format.

In this case a "writer" is some type, `W`, which implements the
[`Write`][write] and [`Seek`][seek] traits. Rust's standard library gives us
such a `W` in the form of [`std::io::Cursor<T>`][cursor]. We can use a
[`Vec<u8>`][vec] for our cursor's buffer type, `T`.

```rust
let mut cursor = Cursor::new(vec![]);
```

As for the "specified format", `save` has some logic to infer output format
from file extension, but with `write_to` we can just pass
[`ImageOutputFormat::Png`][image_output_format_png].

```rust
img.write_to(&mut cursor, ImageOutputFormat::Png).unwrap();
```

The `Vec<u8>` wrapped by our cursor now contains all the bytes for a proper
(albeit blank) PNG. We can work with that `Vec<u8>` directly by consuming the
cursor with [`into_inner`][cursor_into_inner].

### Serving the Image

At this point we need to tell Axum how to serve the image we've created. How do
we turn a `Vec<u8>` into a response that a client will understand as an image?

Axum knows how to serve `Vec<u8>` out of the box, but if we change the
handler's signature to return just that we'll have undesired behavior.

```rust
async fn root(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Vec<u8> {
    // ..
    cursor.into_inner()
}
```

Check that with `curl` and you'll see a response like

```bash
$ curl --head http://localhost:3000/
HTTP/1.1 200 OK
content-type: application/octet-stream
content-length: 1726
date: Thu, 28 Dec 2023 02:30:17 GMT
```

Note that the `Content-Type` header is
[`application/octet-stream`][application_octet_stream] and **not**
[`image/png`][image_png]. We need analogs for PHP's `header` and `imagepng` in
order to tell the client the response is a PNG.

We could build an appropriate [`Response`][http_response] ourselves, but the
magic of Axum's [`IntoResponse`][axum_into_response] trait provides a clear,
terse syntax for this that I find preferable.

```rust
async fn root(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> impl IntoResponse {
    // ...
    ([(header::CONTENT_TYPE, "image/png")], cursor.into_inner())
}
```

We return a tuple with an array mapping header names to values and the bytes
for the body. Axum's [blanket implementations] for `IntoResponse` do all the
work to figure out how to turn that into an HTTP response.

Putting it all together our current handler looks like this.

```rust
async fn root(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> impl IntoResponse {
    let _text = format!("Hello, {}", addr.ip());
    let img = ImageBuffer::from_pixel(WIDTH, HEIGHT, BACKGROUND_COLOR);

    let mut cursor = Cursor::new(vec![]);
    img.write_to(&mut cursor, ImageOutputFormat::Png).unwrap();

    ([(header::CONTENT_TYPE, "image/png")], cursor.into_inner())
}
```

The `_text` is notably being ignored right now. We can get IP addresses, we
can create PNGs, and we can serve them. Now what remains is to put the text in
the image.

### Adding Text

For the Rust analog of PHP's `imagettftext` we need a way to draw text on our
image. The `image` crate doesn't provide any routines for manipulating text,
but it does recommend the [`imageproc`][imageproc] crate, which is maintained
by the same organization.

```bash
$ cargo add imageproc@0.23.0
```

This crate provides a [`draw_text_mut`][draw_text_mut] function, which will
draw text onto an existing image. From its signature we can gather it needs a
whopping 7 arguments (PHP's `imagettftext` is 8, so maybe I shouldn't
complain). Naturally, these aren't really documented, but we can learn a lot
from Rust signatures alone.

- `canvas` &mdash; Any type that implements `imageproc`'s
  [`Canvas`][imageproc_drawing_canvas] trait.
- `color` &mdash; Any [`Pixel`][image_pixel] which can be drawn on that
  `canvas`.
- `x` &mdash; The x-coordinate at which to start drawing the text.
- `y` &mdash; The y-coordinate at which to start drawing the text.
- `scale` &mdash; The [`Scale`][rusttype_scale] of the font face used when
  drawing the text.
- `font` &mdash; The [`Font`][rusttype_font] the text should be drawn in.
- `text` &mdash; The text itself.

That feels like a lot, but we already have most of what we need. Luckily our
existing `ImageBuffer` satisfies the `Canvas` trait and we already know it's
using `Rgb` pixels which satisfy the `Pixel` trait. The `x` and `y` coordinates
were given in the original PHP and we already have our `_text`. We only need a
`Scale` and a `Font`. To work with both we'll need the [`rusttype`][rusttype]
crate.

```bash
$ cargo add rusttype@0.9.3
```

#### Getting a Font

`TODO: Should I use the same font as the code for this blog?`

In PHP-land with `imagettftext` we just specified the path to a [TrueType] font
file (`UbuntuMono-Regular.ttf`) and went on our merry way. Our Rust libraries
want us to create a `Font`, which requires us to load the contents of that
font file into our application.

We could do this on every request, which is what the PHP actually does. Or, we
could do one better and bake the font directly into our application with Rust's
[`include_bytes!`][include_bytes] macro. I threw in the [`concat!`][concat] and
[`env!`][env] macros as well for completeness.

```rust
const FONT_DATA: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/fonts/UbuntuMono-R.ttf"
));

// ...

let font = Font::try_from_bytes(FONT_DATA).unwrap();
```

#### Setting a Scale

``TODO: Talk about `Scale`, font size, pixels, and [point].``

`TODO: What is the licensing for the font? Can I even use it? https://launchpad.net/ubuntu-font-licence https://bazaar.launchpad.net/~ufl-contributors/ubuntu-font-licence/trunk/view/head:/ubuntu-font-licence-1.0.txt`

`TODO: Fix image container. Figcaption?`
<div style="display: flex; align-items: center; justify-content: center;">
  <img style="height: 256px; width:256px;" src="draw-text.png" height="256" width="256" alt="TODO: Draw text on PNG">
</div>

#### Handling Newlines

`TODO: Talk about handling newlines.`

## How Can We Make It Better?

### Creating One Font

### Error Handling

### IPv6 Support

### SVG

- Turns out SVG is hard and possibly not much better?
- Newline support is not much more clear. `tspan` vs. `textArea` (not supported)

### Topics I would like to have gotten to, but didn't have time for

### Benchmarking?

### HTTP 2?

[server]: https://www.php.net/manual/en/reserved.variables.server.php
[explode]: https://www.php.net/manual/en/function.explode.php
[imagecreate]: https://www.php.net/manual/en/function.imagecreate.php
[die]: https://www.php.net/manual/en/function.die.php
[imagecolorallocate]: https://www.php.net/manual/en/function.imagecolorallocate.php
[imagettftext]: https://www.php.net/manual/en/function.imagettftext.php
[header]: https://www.php.net/manual/en/function.header.php
[imagepng]: https://www.php.net/manual/en/function.imagepng.php
[imagedestroy]: https://www.php.net/manual/en/function.imagedestroy.php
[point]: https://en.wikipedia.org/wiki/Point_(typography)

[finished production code]: TODO_TODO_TODO_TODO_TODO_TODO_TODO
[The Book]: https://doc.rust-lang.org/book/
[code golf]: https://en.wikipedia.org/wiki/Code_golf
[Apache]: https://httpd.apache.org/
[mod_php]: https://cwiki.apache.org/confluence/display/httpd/PHP#PHP-Usingmod_phpasaDSO(legacy)
[Nginx]: https://nginx.org/en/
[Axum]: https://github.com/tokio-rs/axum
[Actix]: https://actix.rs/
[Rocket]: https://rocket.rs/
[hello_world]: https://en.wikipedia.org/wiki/%22Hello,_World!%22_program
[automagically]: https://en.wiktionary.org/wiki/automagical
[handler]: https://docs.rs/axum/0.7.1/axum/index.html#handlers
[closure]: https://doc.rust-lang.org/book/ch13-01-closures.html
[axum_routing_get]: https://docs.rs/axum/0.7.1/axum/routing/method_routing/fn.get.html
[extractor]: https://docs.rs/axum/0.7.1/axum/index.html#extractors
[axum_extract_connectinfo]: https://docs.rs/axum/0.7.1/axum/extract/struct.ConnectInfo.html
[socket_addr]: https://doc.rust-lang.org/std/net/enum.SocketAddr.html
[into_make_service_with_connect_info]: https://docs.rs/axum/0.7.1/axum/struct.Router.html#method.into_make_service_with_connect_info
[move]: https://doc.rust-lang.org/std/keyword.move.html
[async_block]: https://doc.rust-lang.org/reference/expressions/block-expr.html#async-blocks
[borrowing and ownership]: https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html
[curl]: https://curl.se/

[image]: https://crates.io/crates/image
[image_buffer]: https://docs.rs/image/0.24.7/image/struct.ImageBuffer.html
[image_buffer_from_pixel]: https://docs.rs/image/0.24.7/image/struct.ImageBuffer.html#method.from_pixel
[image_rgb]: https://docs.rs/image/0.24.7/image/struct.Rgb.html
[PNG file format]: https://en.wikipedia.org/wiki/PNG#File_format
[image_buffer_save]: https://docs.rs/image/0.24.7/image/struct.ImageBuffer.html#method.save
[spawn_blocking]: https://docs.rs/tokio/1.34.0/tokio/task/fn.spawn_blocking.html
[image_buffer_write_to]: https://docs.rs/image/0.24.7/image/struct.ImageBuffer.html#method.write_to
[write]: https://doc.rust-lang.org/std/io/trait.Write.html
[seek]: https://doc.rust-lang.org/std/io/trait.Seek.html
[cursor]: https://doc.rust-lang.org/std/io/struct.Cursor.html
[image_output_format_png]: https://docs.rs/image/0.24.7/image/enum.ImageOutputFormat.html#variant.Png
[vec]: https://doc.rust-lang.org/std/vec/struct.Vec.html
[cursor_into_inner]: https://doc.rust-lang.org/std/io/struct.Cursor.html#method.into_inner
[application_octet_stream]: https://www.iana.org/assignments/media-types/application/octet-stream
[image_png]: https://www.iana.org/assignments/media-types/image/png
[http_response]: https://docs.rs/http/1.0.0/http/response/struct.Response.html
[axum_into_response]: https://docs.rs/axum/0.7.1/axum/response/trait.IntoResponse.html
[blanket implementations]: https://users.rust-lang.org/t/what-are-blanket-implementations/49904

[imageproc]: https://docs.rs/imageproc/0.23.0/imageproc/index.html
[draw_text_mut]: https://docs.rs/imageproc/0.23.0/imageproc/drawing/fn.draw_text_mut.html
[imageproc_drawing_canvas]: https://docs.rs/imageproc/0.23.0/imageproc/drawing/trait.Canvas.html
[image_pixel]: https://docs.rs/image/0.24.7/image/trait.Pixel.html
[rusttype_scale]: https://docs.rs/rusttype/0.9.3/rusttype/struct.Scale.html
[rusttype_font]: https://docs.rs/rusttype/0.9.3/rusttype/enum.Font.html
[TrueType]: https://en.wikipedia.org/wiki/TrueType
[rusttype]: https://docs.rs/rusttype/0.9.3/rusttype/index.html
[include_bytes]: https://doc.rust-lang.org/std/macro.include_bytes.html
[concat]: https://doc.rust-lang.org/std/macro.concat.html
[env]: https://doc.rust-lang.org/std/macro.env.html
