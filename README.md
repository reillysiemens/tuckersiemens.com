# [https://tuckersiemens.com](https://tuckersiemens.com)

The canonical web presence of Reilly Tucker Siemens.

## Generating the Site

### Prerequisites:
- [Rust] and [cargo].

### Steps
1. Clone this site and enter the directory.
   ```shell
   repo='tuckersiemens.com'; git clone git@github.com:reillysiemens/${repo}.git && cd $repo
   ```
2. Install or update to the latest [Zola].
   ```shell
   make update-zola
   ```
3. Build the site!
   ```shell
   make build
   ```

[Rust]: https://www.rust-lang.org
[cargo]: https://crates.io/install
[Zola]: https://github.com/getzola/zola
