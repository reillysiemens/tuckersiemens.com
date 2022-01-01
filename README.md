# [https://tuckersiemens.com](https://tuckersiemens.com)

Tucker's website.

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

## Inspiration

The design of this website was inspired by [gruvbox], [Ruud van Asseldonk],
[Andrew Kvalheim], [Amos Wenger], [Alexis King], and many others.

## License

The code for this website is licensed under the [GPLv3](LICENSE).

[Rust]: https://www.rust-lang.org
[cargo]: https://crates.io/install
[Zola]: https://github.com/getzola/zola
[gruvbox]: https://github.com/morhetz/gruvbox
[Ruud van Asseldonk]: https://ruudvanasseldonk.com/
[Andrew Kvalheim]: https://andrew.kvalhe.im/
[Amos Wenger]: https://fasterthanli.me/
[Alexis King]: https://lexi-lambda.github.io/
