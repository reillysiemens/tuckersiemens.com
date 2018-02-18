+++
title = "Migrating to FreeBSD Hosting"
description = "Migrating to FreeBSD hosting."
date = "2017-11-19T00:00:00-08:00"
tags = ["FreeBSD", "hosting"]
+++

<img src='freebsd-logo.svg' alt='FreeBSD Logo' class='no-border' />

# How This Site Is Hosted

In a time when things like AWS S3 and Cloudflare are commonplace it might
surprise you to hear that this simple static site is hosted by a server I
manage directly. I've done it this way for the last few years and I don't
think I'll stop anytime soon. If nothing else, it provides a way for me to keep
my sysadmin skills sharp.

# Why FreeBSD?

Prior to migrating in July this site was hosted using Debian Jessie. That was
working well enough, but I was attracted to FreeBSD for several reasons. First,
both the kernel and userland are developed in concert as a single operating
system rather than separately like Linux and GNU. As a result it seems like the
community has a more cohesive vision about what they're trying to build.
Second, FreeBSD also has built-in [ZFS][ZFS] support (with no licensing
concerns). Third, it has a powerful system for securing/virtualizing
applications in [jails][FreeBSD jails]. Finally, it supports both
[source and binary package management][FreeBSD Software].

These features combined make for an excellent server platform. What more could
one ask for than a dedicated community, a rock-solid filesystem, lightweight
application segmentation, and the flexibility to install software as you see
fit?

# Users and Authentication

I always start configuring a new server by adding an unprivileged user for
myself.
```bash
sudo adduser
```

After I've gone through the `adduser` prompts I logout and copy over my SSH
public key so I no longer have to use password authentication.
```bash
# On my local machine.
ssh-copy-id -i ~/.ssh/id_ed25519.pub $(whoami)@138.68.17.245
```

Since I'm using DigitalOcean for my VPS provider I take care to remove their
default user since I don't intend to use it for anything.
```bash
sudo rmuser freebsd
```

At this point I can tighten up my SSH daemon config. I turn off password
authentication so that only SSH keys can be used. On an ordinary FreeBSD system
I wouldn't have to turn off root logins as that's the default, but
DigitalOcean does some nonsense that allows root logins just to print out a
message that tells you to use the `freebsd` user instead, so I explicitly
disable that as well.

# TODO: ADD SOMETHING ABOUT `AllowUsers` HERE

As a final step, I run `sshd` on a non-standard port because it cuts a lot of the bot 
chatter out of my logs, but it's security through obscurity won't stop someone
who's serious about attempting to login from making a connection.
```conf
# /etc/ssh/sshd_config
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePam no
PermitRootLogin no
AllowUsers $INSERT FANCY USERNAME HERE YO
Port 1337
```

The SSH daemon then needs to be restarted so the changes take effect.
```bash
sudo service sshd restart
```

# Basic Host Configuration

After users and authentication are taken care of we can take care of some other
mundane tasks to get our house in order.

The system needs to be configured to know what timezone it's in.
```bash
sudo tzsetup
```

Since FreeBSD 10.2 the default `pkg` repository has been changed to update on a
[quarterly basis][quarterly updates] for stability reasons. I like to get
software updates more frequently, so I create
`/usr/local/etc/pkg/repos/FreeBSD.conf` to override the default.

```bash
sudo mkdir -p /usr/local/etc/pkg/repos
sudo sed 's/quarterly/latest/' /etc/pkg/FreeBSD.conf > /usr/local/etc/pkg/repos/FreeBSD.conf
```

Then we need to download and install software updates.
```bash
sudo freebsd-update fetch install
sudo pkg update && sudo pkg upgrade

# Reboot for good measure.
sudo reboot
```

# Basic Firewall
- This also requires some `cloned_interface` business in `/etc/rc.conf`...
- This doesn't really make sense without setting up the jail.
- Maybe explain with comments?

```conf
# /etc/pf.conf
pub_ip = "138.197.157.63"
ext_if = "vtnet0"
int_if = "lo1"
jail_net = $int_if:network

allowed_services = "{80, 443, 1337}"

web_services = "{80, 443}"
web_jail_ip = "172.16.0.2"

nat pass on $ext_if from $jail_net to any -> $pub_ip
rdr pass on $ext_if proto tcp from any to $pub_ip port $web_services -> $web_jail_ip

block in all
pass in quick proto icmp all
pass in proto tcp from any to any port $allowed_services
pass out all
```
Run an `nmap` scan just for good measure.
```bash
nmap -sV --version-intensity 5 138.68.17.245
```

[ZFS]: https://www.freebsd.org/doc/handbook/zfs.html
[FreeBSD jails]: https://www.freebsd.org/doc/handbook/jails.html
[FreeBSD Software]: https://www.freebsd.org/doc/en_US.ISO8859-1/books/handbook/ports-overview.html
[quarterly updates]: https://forums.freebsd.org/threads/52843/
