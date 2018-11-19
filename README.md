# [https://tuckersiemens.com](https://tuckersiemens.com)

The canonical web presence of Reilly Tucker Siemens.

## Generating the Site

### Prerequisites:
- [Rust] and [cargo].

### Steps
1. Clone this site and enter the directory.
   ```bash
   git clone git@github.com:reillysiemens/tuckersiemens.com.git
   cd tuckersiemens.com
   ```
2. Install the latest [Zola] from source.
   ```bash
   git clone git@github.com:getzola/zola.git /tmp/zola
   pushd /tmp/zola
   git checkout $(git describe --tags $(git rev-list --tags --max-count=1))
   cargo install  # This might take a minute. Grab some coffee.
   popd
   ```
3. Build the site!
   ```
   make build
   ```

[Rust]: https://www.rust-lang.org
[cargo]: https://crates.io/install
[Zola]: https://github.com/getzola/zola
