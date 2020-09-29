+++
title = "Building Our Wedding Website"
description = "Building our wedding website."
date = 2020-09-13T00:00:00-08:00
tags = ["personal", "web development", "Python", "PostgreSQL", "FreeBSD"]
+++
<link rel="stylesheet" href="example.css">

# Building Our Wedding Website

My wife and I got married a little more than a year ago. While reflecting on
this first year of marriage has been I remembered that I promised some friends
I'd share how I built our wedding website.

It was important to me that we give guests a convenient way to RSVP without
sharing any of their personal data with third parties like [Paperless Post] or
[The Knot]. If I'm honest, I also didn't want yet another account on yet
another website. I didn't fully realize what I was getting myself into when I
made that decision as planning a wedding turned out to be a lot of work on its
own, but I was committed!

Over the course of about 2 weeks' worth of _long_ nights and weekends this is
what I came up with. We'll explore all the details from the
[database design](#database) to the [CSS](#css), so strap yourself in for what
is undoubtedly my longest blog post to date!

**TODO**: The easiest way to break your previous record for blog posts in a year
is to write one big post and then break it up into smaller chunks.

# How Should It Work?

My first consideration was the guest experience. How should guests interact
with this website? We had already agreed to send paper invites in the mail, so
how could I work with that?

I let these thoughts guide my design:
1. I knew who I was sending each invitation to, so I could personalize the
   experience.
2. We were sending paper invitations, but typing out URLs is a tedious task.
3. Many of the quests were tech-savvy friends of mine. I didn't want it to be 
   _trivial_ for them to mess with other guests if they got curious about what
   was under the hood.

What I arrived at was sending guests an invitation with a [QR code] on it. Of
course, I also felt I should include the written link as a last resort for
those unfamiliar with QR codes. That meant the link in the QR code also needed
to be human-readable rather than a string of long, random characters. I opted
to go for a [Gfycat]-style, animal-inspired naming convention.

# Back-end

Once guests RSVP'd I would need to aggregate their responses somewhere, so
the [front-end][frontend-and-backend] seen by the the guests needed a
corresponding back-end for response processing and persistance.

A server-side task called for a server-side programming language. Originally I
wanted to use [Rust], which I've become very fond of. Unfortunately, I
procrastinated a bit getting started and I needed to bang out the application
quickly. In the interest of time, I fell back to the comfort and familiarity of
my daily driver, [Python].

If I wasn't going to use Rust I at least wanted to do _something_ new though,
so I made it a goal to write the back-end using Python's native
[`async`/`await`][PEP492] syntax.


## Database

With the language and I/O paradigm choices behind me, I could turn my attention
to the database. Given that guests received invitations by group I figured a
[relational database] made sense as a storage mechanism. I could have used
[SQLite] since we had a small number of guests, but decided to go with
[PostgreSQL] since I use it often at work and I wanted to continue learning
about it.

### Schema

I decided on a straightforward database schema consisting only of `groups` and
`guests`. Each guest would belong to a single group and the invitation would be
sent to the whole group. This made it so we wouldn't have to send multiple QR
codes to the many couples and families we were inviting. Solo guests were
considered a "group" of one.

#### Groups

Here's the raw SQL I used to create the `groups` table.

```sql
-- Create the groups table.
CREATE TABLE groups (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    responded TIMESTAMP
);
```

I could have used the `name` column as a primary key since it's non-nullable
and unique, but I default to autoincrementing integers. I'm not always
reaching for the [n<sup>th</sup> normal form][database normalization] and I
didn't think the _miniscule_ additional storage for this particular use case
was worth sweating.

If it helps you to visualize tabular data, here are some example rows from
the database.

| `id` | `name`                           | `responded`                |
|------|----------------------------------|----------------------------|
| 1    | seriously-silly-salamander       | 2019-05-07 01:38:29.928278 |
| 2    | rambunctiously-rapacious-raccoon | 2019-05-01 13:46:10.577326 |


#### Guests

Here's the raw SQL I used to create the `guests` table.

```sql
-- Required for the uuid field.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create the guests table.
CREATE TABLE guests (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    attending BOOLEAN NOT NULL DEFAULT false,
    group_id INTEGER NOT NULL REFERENCES groups (id),
    uuid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid()
);
```

Here's some example data.

| `id` | `name`     | `attending` | `group_id` | `uuid`                               |
|------|------------|-------------|------------|--------------------------------------|
| 1    | Castor     | f           | 1          | 04617eb2-1fe6-4b27-8561-6db3164677ec |
| 2    | Pollux     | t           | 1          | 816fc278-b9af-4b99-af9f-f6fb237d2ea9 | 
| 3    | Helen      | t           | 2          | 1474bc74-3520-4054-9f02-47d4c4cc286c |

There are a handful of things worth noting about the `guests` table here.

1. The bit about [`pgcrypto`][pgcrypto] adds a PostgreSQL extension for
   generating random version-4 [UUID]s. That way the database itself takes care
   of that for us whenever a new guest is added.
2. [Castor and Pollux] are a pair and thus share the same `group_id`, but one
   can be `attending` without the other.
3. The `name` column is _not_ unique, so we could have multiple guests with
   the same name.
5. There's no funny business with
   [`first_name` or `last_name`][falsehoods programmers believe about names]
   columns.
6. Guests are not `attending` by default. That assumption is relied upon later
   on during
   [validation](#server-side-validation-a-k-a-sets-are-magic-star-struck).

### Adding Groups and Guests

Since I was operating on a strict schedule I opted to add these groups and
guests to the database manually with two big `INSERT`s. Conviently, I could
omit nullable columns like `groups.responded` or columns with defaults like
`guests.attending` and `guests.uuid` and they'd get filled in automatically.

```sql
-- Add groups based on pre-determined QR code links.
INSERT INTO groups (name) VALUES
    ('seriously-silly-salamander'),
    -- ...
    ('rambunctiously-rapacious-raccoon');


-- Add guests (first names only!) to their appropriate groups.
INSERT INTO guests (id, name, group_id) VALUES
    (1, 'Castor', 1),
    (2, 'Pollux', 1),
    -- ...
    (3, 'Helen', 2);
```

This is far from an ideal way to add data to a production application, but I
didn't see the need to write application code for an administrative action that
was going to be a one-time task. I suppose I could also have used PostgreSQL's
[`COPY`][COPY] command to import a CSV, but hindsight is always 20/20. If I
were to continue working on this project I'd probably tackle better data injest
first.

### Operations

With a proper schema for my two tables out of the way, I now needed a few
functions to support the database operations I would need. The code below
uses [SQLAlchemy Core]'s [Expression Language] and and the convenient
[`databases`][databases] library.


1. **Fetching `groups`**
   ```python
   async def fetch_group(db, name):
       """Fetch a group from the database by its name."""
       query = groups.select().where(groups.c.name == name)
       record = await db.fetch_one(query)
   
       if not record:
           raise GroupNotFound
   
       return record
   ```
   This one's pretty easy. We just select a group by its `name`. If we didn't
   find a group we raise a `GroupNotFound` exception.
2. **Fetching `guests`**
   ```python
   async def fetch_guests(db, group_id):
       """Fetch guests from the database by their group ID."""
       query = (
           select([guests.c.uuid, guests.c.name, guests.c.attending])
           .where(guests.c.group_id == group_id)
           .order_by(guests.c.id.asc())
       )
       records = await db.fetch_all(query)
       return records
   ```
   This one's slightly more complex, but not too bad. We fetch the guest's
   UUID, name, and attendance as long as their `group_id` matches the supplied
   one. No matching guests? The `records` returned are just an empty list.
3. **Updating Attendance**
   ```python
   async def update_attendance(db, group_name, guests_attending):
       """Update group attendance for a set of guests."""
       update_guest_attendance = (
           guests.update()
           .values(attending=true())
           .where(guests.c.uuid.in_(guests_attending))
       )
   
       update_group_response = (
           groups.update()
           .values(responded=datetime.utcnow())
           .where(groups.c.name == group_name)
       )
   
       async with db.transaction():
           await db.execute(update_guest_attendance)
           await db.execute(update_group_response)
   ```
   Updating attendance is the most complicated of the operations because it
   touches multiple database tables, so we do them in a [transaction] to ensure
   both `UPDATE`s succeed or not at all. When we update we set the attendance
   status to `true` and record the time at which the guest responded.

### Querying Attendance

Continuing to keep application code for administrative actions to a minimum (as
with [adding groups and guests](#adding-groups-and-guests)), I opted for ad hoc
attendance queries with raw SQL. This was enough to produce all the information
I needed ahead of the wedding.

```sql
-- Who's coming?
SELECT groups.responded AS "responded at",
       groups.name AS "group name",
       string_agg(CASE WHEN guests.attending = true THEN guests.name ELSE NULL END, ', ' ORDER BY guests.name) AS attending,
       string_agg(CASE WHEN guests.attending = false AND groups.responded IS NOT NULL THEN guests.name ELSE NULL END, ', ' ORDER BY guests.name) as "not attending",
       string_agg(CASE WHEN groups.responded IS NULL THEN guests.name ELSE NULL END, ', ' ORDER BY guests.name) as "no response"
  FROM guests
       JOIN groups ON guests.group_id = groups.id
       GROUP BY groups.responded, groups.name
       ORDER BY groups.responded;
```

Those [`CASE`][CASE] expressions in the [`string_agg()`][string agg] calls are ugly
as sin and there's probably a cleaner way to do the job, but in a pinch they
provided handy output like this. The `¤` here denotes a `NULL`.

| `responded at`             | `group name`                     | `attending`    | `not attending` | `no response` |
|----------------------------|----------------------------------|----------------|-----------------|---------------|
| 2019-05-07 01:38:29.928278 | seriously-silly-salamander       | Castor, Pollux | ¤               | ¤             |
| 2019-05-01 13:46:10.577326 | rambunctiously-rapacious-raccoon | ¤              | Helen           | ¤             |

## Web App

With the core functionality of the database behind me, my focus turned to the
back-end web app. I sure as heck wasn't going to parse [HTTP requests] myself, so
I did a quick survey of the [`async`-compatible][ASGI] Python web frameworks at the
time. I settled on [Starlette] for its familiar syntax, advanced feature set,
and clean documentation.

### Routes

Web apps like this are composed of "routes". In simple terms, that means rules
are defined for what happens when you request different pages. Like [Flask] and
other popular Python web frameworks, Starlette allowed you to define those with
the [`@app.route`][app routing] [decorator] (I think they prefer
[another syntax] today). I defined 3 routes for this application.

1. `/` &mdash; A simple homepage. Pretty self-explanatory.
   ```python
    @app.route("/")
    async def index(request):
        """Serve the homepage."""
        return TemplateResponse(name="index.html", context={"request": request})
   ```
2. `/wedding/` &mdash; A static page with wedding info like date, location,
   etc. Also straightforward.
   ```python
   @app.route("/wedding/")
   async def event(request):
       """Serve static wedding information."""
       return TemplateResponse(name="wedding.html", context={"request": request})
   ```
3. `/wedding/{group}/` &mdash; The meat of the RSVP application.
   ```python
   @app.route("/wedding/{group}/", methods=["GET", "POST"])
   async def wedding_group(request):
       """Serve the RSVP form and update attendance on submissions."""
       name = request.path_params["group"]
       group = await fetch_group(db, name)
       guests = await fetch_guests(db, group["id"])
   
       if not group["responded"]:
           if request.method == "GET":
               # Serve the response page to guests who haven't responded yet.
               return TemplateResponse(
                   "group.html",
                   context={"request": request, "group": name, "guests": guests},
               )
           else:
               # Update attendance from form data upon submission.
               attending = await validate_attendees(request, guests)
               await update_attendance(db, name, attending)
   
       # FIXME: `url_for()` doesn't seem to work when behind a reverse proxy...
       return RedirectResponse(url="/wedding/")
   ```
   There's a quite a bit more going on in the route above than the others, so I
   think it bears some explanation. Importantly, it responds to both
   [HTTP `GET` and `POST` requests][HTTP request methods]. The same function
   handles fetching the HTML form _and_ its submission.

   On initial page load (the `GET` request), we serve up the HTML form. When
   someone clicks (or, more likely, taps) the "RSVP" button (the `POST`
   request), the form is requested

### Server-Side Validation (A.K.A Sets Are Magic 🤩)

[Client-side form validation] is all well and good, but relying on it alone is
a recipe for disaster. I didn't want to trust that one of those aforementioned
tech-savvy friends wouldn't go tinker with the HTML, change a UUID, and try to
make an invalid submission to see what would happen. So, I validated the form
submission on the server as best I could.

```python
async def validate_attendees(request, guests):
    """Validate attendees, returning a set of their UUIDs."""
    form = await request.form()
    guests = {guest["uuid"] for guest in guests}

    try:
        attending = {UUID(uuid) for uuid in form.getlist("attending")}
        assert attending.issubset(guests)
    except (ValueError, AssertionError):
        raise InvalidForm("The submitted form was invalid")

    return attending
```

The function above validates attendees with five scenarios in mind.

1. **An Invalid UUID**

   Someone could change the form data to include a malformed UUID like
   `5bee934b-ab-lolwut-this-aint-no-uuid`. In this case calling
   [`uuid.UUID()`][uuid.UUID] raises a `ValueError`, which we handle.

2. **A Valid UUID Belonging to No Groups**

   Someone could change the form data to include a UUID that was well-formed,
   but that did not belong to any group. We're saved here by the magic of
   [sets] and the [`set.issubset()`][set.issubset] call. If any `attending`
   UUID is not part of the `guests` set we'll fail our assertion that
   `attending` should be a [subset] of `guests`, which we trust to be valid in
   the database because we don't allow them to change.

3. **A Valid UUID in the Wrong Group**

   Someone could change the form data to include a UUID that was well-formed
   and belonging to a different group than the one from the request. This
   should be _**extremely**_ unlikely since someone would have to
   [generate a UUID collision][uuid collision].

   Nevertheless, even if they did manage to generate a UUID for a guest in
   another group we're saved by sets again. Remember that the `guests.uuid`
   column in our database is unique. We've defined our `groups` such that they
   contain [disjoint sets] of guest UUIDs and disjoint sets cannot be subsets
   of one another (with, _I think_, the exception of the [empty set] and
   itself).

4. **No UUIDs Submitted**

   Someone could change the form data to submit no UUIDs at all. In this case
   the empty set _is_ a subset of any other set (including our `guests`). This
   ends up not being a big deal, however, because return an empty `attending`
   set just means none of the guests in that group are attending. If someone
   deletes some checkboxes from their HTML form before submitting they can only
   shoot themselves in the foot.

5. **Duplicate UUIDs Submitted**

   Someone could change the form data to include multiple occurences of the
   same UUID. Lucky for us, sets also have a de-duplicating property. Multiple
   elements are simply forgotten because sets are defined as a collection of
   _distinct_ objects.

   You can see this for yourself at any Python [REPL].

   ```python
   >>> from uuid import UUID
   >>> a = {
   ...     UUID("4a95d2a6-7277-408d-bfee-bdb87831291e"),
   ...     UUID("4a95d2a6-7277-408d-bfee-bdb87831291e"),
   ... }
   ...
   >>> b = {UUID("4a95d2a6-7277-408d-bfee-bdb87831291e")}
   >>> a == b
   True
   ```

   Any group members omitted from the submission retain their initial
   `attending` status because they aren't included in the set of guests who
   need updating.

If I'm honest, the use of `assert` in the validation code above is a little bit
of a hack. Normally, I think that using `assert` outside of test code is bad
form, but the only alternative I could think of at the time was

```python
try:
    ...
    if not attending.issubset(guests):
        raise ValueError
except ValueError:
    ...
```

and that looked just as weird to me. Either way it's an implementation detail
and the `AssertionError` never escapes the function, so... no harm, no foul? 😅

### Error Handling

There are doubtless other errors I missed handling , but for an [MVP]
application I identified these and tried to handle them accordingly.

1. **Invalid Groups**
   ```python
   @app.exception_handler(GroupNotFound)
   async def handle_group_not_found(request, exc):
       """Catch `GroupNotFound` exceptions and render an error page."""
       context = {"request": request, "message": "404 Not Found"}
       return TemplateResponse("error.html", context=context, status_code=404)
   ```
   Remember from the [database operations section](#operations) that attempts
   to fetch a group that couldn't be found in the database raise a custom
   `GroupNotFound` exception. It seemed to me that
   [`404 Not Found`][404 not found], the poster child for [HTTP status codes],
   was the most appropriate error here.
2. **Invalid Form Submission**
   ```python
   @app.exception_handler(InvalidForm)
   async def handle_invalid_form(request, exc):
       """Catch `InvalidForm` exceptions and render an error page."""
       context = {"request": request, "message": "400 Bad Request"}
       return TemplateResponse("error.html", context=context, status_code=400)
   ```
   Just above, in the
   [server-side validation](#server-side-validation-a-k-a-sets-are-magic-star-struck)
   section, there is an `InvalidForm` exception raised when something is amiss
   with form data. I figured [`400 Bad Request`][400 bad request] was most
   appropriate here since a poor form submission probably means a client error.
3. **Server Errors**
   ```python
   @app.exception_handler(500)
   async def handle_internal_server_error(request, exc):
       """Catch internal server errors and render an error page."""
       context = {"request": request, "message": "500 Internal Server Error"}
       return TemplateResponse("error.html", context=context)
   ```
   This last error handler is a bit of a catch all. A
   [`500 Internal Server Error`][500 internal server error] usually means
   something catastrophic happened and that it was my fault for coding
   improperly. It's far from the most user-friendly error message, but it would
   at least give a guest something to contact me about and I could go
   inspect a [stack trace] in the server logs.

# Front-end

## HTML

I mostly wrote the HTML for the site by hand, but I wanted to inject some
dynamic content into the page (especially the `/wedding/{group}` page).
Thankfully Starlette had builtin support for [Jinja], my favorite Python
templating library, so I just used that.

### A Base Page

```jinja
<!DOCTYPE html>
<html lang='en'>
  <head>
    {% block head -%}
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width'>
    <title>{% block title %}{% endblock %}</title>
    <link rel='shortcut icon' type='image/png' href='/static/favicon.png'>
    <link rel='stylesheet' href='/static/site.css'>
    {%- endblock %}
  </head>
  <body>
    {% block content -%}{%- endblock %}
  </body>
</html>
```

### The `/` Page

```jinja
{% extends 'base.html' %}
{% block title %}Our Wedding{% endblock %}
{% block content -%}
  <div id='logo'>
    <img src='/static/favicon.png'>
  </div>
{%- endblock %}
```
Yes, I just reused the favicon for an image on the homepage...

### The `/wedding/` Page

```jinja
{% extends 'base.html' %}
{% block title %}Our Wedding{% endblock %}
{% block content -%}
  <header class='flex-container'>
    <div class='flex-item'>
      <img class='flex-content' src='/static/picture1.jpg'>
    </div>
    <!-- Several more flex items... -->
  </header>
  <main>
    <section>
      <h1>Some Section Heading</h1>
      <p>Some section content...</p>
    </section>
    <!-- Many more sections omitted... -->
  </main>
{%- endblock %}
```

### The `/wedding/{group}` Page

```jinja
{% extends 'base.html' %}
{% block title %}Our Wedding{% endblock %}
{% block content %}
  <main>
    <h1>We're Getting Married!</h1>
    <form action='/wedding/{{ group }}/' method='post'>
      <fieldset>
        <legend><b>Let Us Know Who's Coming</b></legend>
        {% for guest in guests -%}
        <div>
          <div class='checkbox'>
            <input class='toggle' id='guest-{{ guest['uuid'] }}' type='checkbox' name='attending' value='{{ guest['uuid'] }}'>
            <label for='guest-{{ guest['uuid'] }}'>{{ guest['name'] }}</label>
          </div>
        </div>
        {%- endfor %}
        <input type='submit' value='RSVP'>
      </fieldset>
    </form>
  </main>
{% endblock %}
```

You might notice something peculiar about the `<input>` for the form above. The
`name` attribute is the same for every element in the `for` loop. Only the
`value` changes. It turns out TODO.

## CSS

<figure>
<video controls autoplay loop src="css.webm"></video>
<figcaption>
Live footage of me working with CSS for this project.
</figcaption>
</figure>

Mention MDN, https://css-tricks.com/, https://caniuse.com/, Julia Evans

The complete `site.css` file is long and mostly not worth showcasing here. It's
full of boring minor style details like

```css
h1, h2 {
  color: #222; /* Dark, but like, not _too_ dark... */
}
```

Instead of pasting the whole thing here, I'll share a few of the more
interesting bits and what I learned along the way.

### `<form>` Follows Function

Next time you see a well-polished form on some website, thank the dev for
putting in the extra time. Apparently it's a total pain in the ass to make
forms pretty!

Here's the RSVP form, essentially as it was on the website. Go ahead, toggle
those checkboxes. There's no RSVP button. You can toggle 'em all day with no
consequences. Knock yourself out.

<form>
  <fieldset>
    <legend><b>Let Us Know Who's Coming</b></legend>
      <div class="checkbox">
        <input class="toggle" id="castor" type="checkbox" name="attending" value="castor">
        <label for="castor">Castor</label>
      </div>
      <div class="checkbox">
        <input class="toggle" id="pollux" type="checkbox" name="attending" value="pollux">
        <label for="pollux">Pollux</label>
      </div>
  </fieldset>
</form>

Let's break down the CSS that makes it possible.

First, we make the normal checkbox you'd see invisible. The CSS
[attribute selector] allows us to make sure we only do that for checkboxes.

```css
input[type=checkbox] {
  visibility: hidden;
}
```

We wrap both the `<input>` and `<label>` elements in a `.checkbox` class with
relative positioning so things don't overlap.

```css
.checkbox {
    position: relative;
}
```

Then we add a `.toggle` class which we apply to the `<input>` element. This
is some handwavy, fiddly business that essentially makes it so size of the
`<input>` element is _about_ the size of the image that replaces the normal
checkbox.

```css
.toggle {
  text-align: center;
  position: absolute;
  top: 0;
  bottom: 0;
  margin: auto 0;
  border: none;
  height: 40px;
  width: 40px;
}
```

Finally, we get to the _fancy_ part: custom images to replace the default
checkboxes.

```css
.toggle + label {
  background-image: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%22-10%20-18%20100%20135%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2250%22%20fill%3D%22none%22%20stroke%3D%22%23bdbdbd%22%20stroke-width%3D%223%22/%3E%3C/svg%3E');
  background-repeat: no-repeat;
  background-position: center left;
}

.toggle:checked + label {
  background-image: url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%22-10%20-18%20100%20135%22%3E%3Ccircle%20cx%3D%2250%22%20cy%3D%2250%22%20r%3D%2250%22%20fill%3D%22none%22%20stroke%3D%22%23bddad5%22%20stroke-width%3D%223%22/%3E%3Cpath%20fill%3D%22%2353ae9d%22%20d%3D%22M72%2025L42%2071%2027%2056l-4%204%2020%2020%2034-52z%22/%3E%3C/svg%3E');
}
```

Those `background-images` on the `label`s? Yeah, you saw that correctly. Those
are whole-ass [SVG]s, [percent-encoded] and everything. CSS is amazing and it
will let you specify the raw data right in the `url()`. The
[`:checked`][checked selector] pseudo-class selector lets us switch which
image we're using based on the state of the checkbox.

**TODO**: How to work these elements in without disrupting the flow?

It's also worth noting that, minus some `padding`, the `<label>` for each guest
takes up nearly the width of the form. This makes it easier for mobile users by
requiring less precision when tapping the checkbox. They could miss the actual
`<input>` by a mile and still check the box.

There's no effect for mobile users, but for desktop I also used

```css
label {
  /* ... */
  cursor: pointer
}
```

to change cursors on hover and signal that the element was clickable.

### 💪 Flex Boxin'

After conquering forms I grappled with the hardest question from early 2000's
web development. How do you arrange multiple differently-sized images so that they're
vertically/horizontally centered and evenly spaced within a given container?
The modern answer, it turns out, is [flexbox].

For a visual, let's represent that with these three boxes, each with their own
dimensions. If you're browsing from Firefox on desktop I recommend using the
[Flexbox Inspector] on these boxes while following along.

<div class="flex-container align-center">
  <div class="flex-item">
    <div class="flex-content fake-image" style="width: 100%; height: 5em;">
      <div class="fake-image-text">w<sub>1</sub> x h<sub>1</sub></div>
    </div>
  </div>
  <div class="flex-item">
    <div class="flex-content fake-image" style="width: 80%; height: 2.5em;">
      <div class="fake-image-text">w<sub>2</sub> x h<sub>2</sub></div>
    </div>
  </div>
  <div class="flex-item">
    <div class="flex-content fake-image" style="width: 90%; height: 10em;">
      <div class="fake-image-text">w<sub>3</sub> x h<sub>3</sub></div>
    </div>
  </div>
</div>

I'm going to be totally honest, I'm still a little iffy on this section. So,
don't quote me on this, but this is how I approached it.

First, we make a class with a `display` property of `flex` to hold all our
images. 

```css

.flex-container {
  display: flex;
}
```

I added a class to [vertically align items][flexbox alignment] within the
`.flex-container`, but I now think this might have been accomplished just by
using `margin: auto` on items within the container.

```css
.align-center {
  align-items: center;
}
```

```css
.flex-container .flex-item {
  flex: 1;
  margin: 2.5px;
}

.flex-container .flex-item:first-child {
  margin-left: 5px;
}

.flex-container .flex-item:last-child {
  margin-right: 5px;
}
```

Lastly, because some of the images were SVGs, I made sure the `.flex-content`
filled 100% of the width of its containing element. Without this I think SVGs 
are prone to scale to zero, allowing other image types like JPEG or PNG to
crowd them out of the container.


```css
.flex-container .flex-item .flex-content {
  width: 100%;
}
```

## JavaScript

There wasn't any. In general, I think there's an over-reliance on JavaScript on
the web. That isn't to say I think JavaScript is bad, but when I do front-end
tasks I like to start with plain HTML/CSS and see how far that gets me. For
this project those got me all the way.

# Deployment (Wrapping It All Up?)

## Packaging

## Hosting

Talk about FreeBSD, configuration, etc.

## Database

**TODO**: Does this belong in the intro with the rest of the database stuff?

```sql
CREATE DATABASE rsvp;
```

```sql
CREATE USER rsvp WITH PASSWORD 'hunter2';
```

```bash
psql --host 'localhost' --username 'postgres' --dbname 'rsvp' < create-tables.sql
```

```sql
GRANT SELECT, UPDATE on groups, guests TO rsvp;
```
Remember that I manually added guest data myself. There's no point at which the
application needs a permission like `INSERT` or `DELETE`, so I opted not to
grant those. I prefer to use the [principle of least privilege] where possible.

## Configuration

Mention 12-factor app? Mention environment variable passwords being sketchy?

- https://glyph.twistedmatrix.com/2017/10/careful-with-that-pypi.html
- https://www.diogomonica.com/2017/03/27/why-you-shouldnt-use-env-variables-for-secret-data/
- Ruby app hack with environment variable password loading?

# The Truth of Development

This post has presented a very linear development story. The truth of
development was much more disjointed. I added UUIDs halfway through. It took me
3-4 evenings to finish wrestling with flexbox. I phoned a friend and we stared
at the CSS void for a few hours together before it all clicked. The actual
development was more messy than this post.

# Future Considerations

What would I do differently if I could do it again?
- If anything, `validate_attendees` is more like parsing than validation (link to "Parse, don't validate"). Probably rename that function.
- Handling resubmissions?
- Alembic for migrations.
- Python architecture book. Repository pattern. Probably overkill for a CRUD app.
- More tests.
- More types.
- More documentation.
- [FastAPI]?
- Did I overcomplicate some things? Almost assuredly. Did I have fun? Heck yes, I did.
- Locking concerns? What about two guests clicking RSVP at once? Unlikely to cause issues?
- Mention deployment with Puppet/SaltStack.
- Written this blog post as a multi-part series...

[Paperless Post]: https://www.paperlesspost.com/
[The Knot]: https://www.theknot.com/
[QR code]: https://en.wikipedia.org/wiki/QR_code
[Gfycat]: https://gfycat.com/
[frontend-and-backend]: https://en.wikipedia.org/wiki/Front_end_and_back_end
[Rust]: https://www.rust-lang.org/
[Python]: https://www.python.org/
[PEP492]: https://www.python.org/dev/peps/pep-0492/
[relational database]: https://en.wikipedia.org/wiki/Relational_database
[SQLite]: https://sqlite.org/index.html
[PostgreSQL]: https://www.postgresql.org/
[database normalization]: https://en.wikipedia.org/wiki/Database_normalization
[pgcrypto]: https://www.postgresql.org/docs/12/pgcrypto.html#id-1.11.7.34.9
[Castor and Pollux]: https://en.wikipedia.org/wiki/Castor_and_Pollux
[falsehoods programmers believe about names]: https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/
[UUID]: https://en.wikipedia.org/wiki/Universally_unique_identifier
[COPY]: https://www.postgresql.org/docs/12/sql-copy.html
[SQLAlchemy Core]: https://docs.sqlalchemy.org/en/13/core/
[Expression Language]: https://docs.sqlalchemy.org/en/13/core/tutorial.html
[databases]: https://www.encode.io/databases/
[transaction]: https://en.wikipedia.org/wiki/Database_transaction
[CASE]: https://www.postgresql.org/docs/12/functions-conditional.html#FUNCTIONS-CASE
[string agg]: https://www.postgresql.org/docs/12/functions-aggregate.html
[HTTP requests]: https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol
[ASGI]: https://asgi.readthedocs.io/en/latest/
[Starlette]: https://www.starlette.io/
[Flask]: https://flask.palletsprojects.com/en/1.1.x/
[app routing]: https://github.com/encode/starlette/blob/0.11.4/docs/applications.md
[decorator]: https://en.wikipedia.org/wiki/Python_syntax_and_semantics#Decorators
[another syntax]: https://github.com/encode/starlette/blob/0.13.8/docs/applications.md
[HTTP request methods]: https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol#Request_methods
[Client-side form validation]: https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation
[uuid.UUID]: https://docs.python.org/3/library/uuid.html#uuid.UUID
[uuid collision]: https://en.wikipedia.org/wiki/Universally_unique_identifier#Collisions
[disjoint sets]: https://en.wikipedia.org/wiki/Disjoint_sets
[empty set]: https://en.wikipedia.org/wiki/Empty_set
[REPL]: https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop
[sets]: https://en.wikipedia.org/wiki/Set_(mathematics)
[set.issubset]: https://docs.python.org/3.8/library/stdtypes.html#frozenset.issubset
[subset]: https://en.wikipedia.org/wiki/Subset
[MVP]: https://en.wikipedia.org/wiki/Minimum_viable_product
[404 not found]: https://httpstatuses.com/404
[HTTP status codes]: https://en.wikipedia.org/wiki/List_of_HTTP_status_codes
[400 bad request]: https://httpstatuses.com/400
[500 internal server error]: https://httpstatuses.com/500
[stack trace]: https://en.wikipedia.org/wiki/Stack_trace
[attribute selector]: https://developer.mozilla.org/en-US/docs/Web/CSS/Attribute_selectors
[SVG]: https://en.wikipedia.org/wiki/Scalable_Vector_Graphics
[percent-encoded]: https://en.wikipedia.org/wiki/Percent-encoding
[checked selector]: https://developer.mozilla.org/en-US/docs/Web/CSS/:checked
[flexbox]: https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox
[Flexbox Inspector]: https://developer.mozilla.org/en-US/docs/Tools/Page_Inspector/How_to/Examine_Flexbox_layouts
[flexbox alignment]: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flexible_Box_Layout/Basic_Concepts_of_Flexbox#Alignment_justification_and_distribution_of_free_space_between_items
[Jinja]: https://jinja.palletsprojects.com/en/2.11.x/
[principle of least privilege]: https://en.wikipedia.org/wiki/Principle_of_least_privilege
[FastAPI]: https://fastapi.tiangolo.com/
