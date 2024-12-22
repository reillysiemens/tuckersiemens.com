+++
title = ".NET's Hello World From A Rust Perspective"
description = ".NET's Hello World from a Rust perspective."
url = "posts/hello-dotnet-from-rust"
date = 2024-05-08T00:00:00-07:00
[taxonomies]
tags = ["Rust", "C#", ".NET"]
+++

This post is about the developer experience of a Rust programmer wading into C#.

<!-- more -->

# Ground Rules

Let's set some ground rules to start. We want the following:
- A command line app that says hello to the name you give it.
- Code organized in a `src` directory.

# Installation

# Creating an App

```
tucker@oryoki:~/ $ dotnet new console -o hello-dotnet
The template "Console App" was created successfully.

Processing post-creation actions...
Restoring /tmp/examples/hello-dotnet/hello-dotnet.csproj:
  Determining projects to restore...
  Restored /tmp/examples/hello-dotnet/hello-dotnet.csproj (in 65 ms).
Restore succeeded.


tucker@oryoki:~/ $
```

<pre style="background:#282828;color:#fdf4c1aa"><code><span>tucker@oryoki:~/ $ cargo new hello-rust
</span><span>     <span style="color:#98971a">Created</span> binary (application) `hello-rust` package
</span><span>tucker@oryoki:~/ $
</span></code></pre>

# Running the App

```
tucker@oryoki:~/ $ cd hello-dotnet
tucker@oryoki:~/ $ dotnet run
Hello, World!
tucker@oryoki:~/ $
```

# Project Structure

```
tucker@oryoki:~/hello-dotnet $ tree
.
├── hello-dotnet.csproj
├── obj
│   ├── hello-dotnet.csproj.nuget.dgspec.json
│   ├── hello-dotnet.csproj.nuget.g.props
│   ├── hello-dotnet.csproj.nuget.g.targets
│   ├── project.assets.json
│   └── project.nuget.cache
└── Program.cs

2 directories, 7 files
tucker@oryoki:~/hello-dotnet $
```

# Metadata

# Refactoring

# Testing
