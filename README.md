# [https://tuckersiemens.com](https://tuckersiemens.com)

The canonical web presence of Reilly Tucker Siemens.

## Generating the Site

### Prerequisites:
- [Rust] and [cargo].
- [Node.js] and [yarn].
- [gulp]

### Steps
1. Clone this site and enter the directory.
   ```bash
   git clone https://github.com/reillysiemens/tuckersiemens.com
   cd tuckersiemens.com
   ```
2. Install the latest [gutenberg] from source.
   ```bash
   git clone git@github.com:Keats/gutenberg.git /tmp/gutenberg
   pushd /tmp/gutenberg
   git checkout $(git describe --tags $(git rev-list --tags --max-count=1))
   cargo install  # This might take a minute. Grab some coffee.
   popd
   ```
3. Install the Sass development environment.
   ```bash
   yarn install
   ```
4. Build the site!
   ```
   make build
   ```

[Rust]: https://www.rust-lang.org
[cargo]: https://crates.io/install
[Node.js]: https://nodejs.org
[yarn]: https://yarnpkg.com
[gulp]: http://gulpjs.com
[gutenberg]: https://github.com/Keats/gutenberg
