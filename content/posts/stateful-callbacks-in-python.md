+++
title = "Stateful Callbacks in Python"
description = "Stateful callbacks in Python."
date = 2017-07-10T07:54:00-08:00
[taxonomies]
tags = ["Python", "callbacks"]
+++
If you're unfamiliar with what a callback is, don't worry, we can sort that out
quickly. If callbacks are old hat for you you might want to skip to
[the interesting bit](#stateful-callbacks).

Simply put, a callback is a function that is passed as an argument to
another function which may execute it.

<!-- more -->

Take, for example, these functions:

```python
def bar():
    return "I'm the callback!"

def foo(func):
    return func()
```

If we call `foo` like this

```python
>>> foo(bar)
"I'm the callback!"
```

then `bar` is a callback.

## Why Should I Use A Callback?

There are many reasons to use callbacks. For me, the most compelling is
customization. Let's take a look at a Python built-in as an example. Say we
have a list of users as dictionaries with a `name` and an `age`:

```python
users = [
    dict(age=77, name='John Cleese'),
    dict(age=74, name='Eric Idle'),
]
```

Imagine that we want to sort our users. If we had just a list of ages or a list
of names we could easily do this with the built-in `sorted` function, but by
default Python has no idea how to compare our dictionaries during sorting.

```python
>>> sorted(users)
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
TypeError: unorderable types: dict() < dict()
```

Should it sort by `age`? By `name`? We need to tell Python how this should be
done. Fortunately Python provides and the `sorted` function has a keyword
argument called `key` that takes, you guessed it, a callback. Let's create some
of our own!

```python
def by_age(user):
    return user['age']

def by_name(user):
    return user['name']
```

Armed with these callbacks we can sort our users.

```python
>>> sorted(users, key=by_age)
[{'age': 74, 'name': 'Michael Palin'}, {'age': 77, 'name': 'John Cleese'}]
>>> sorted(users, key=by_name)
[{'age': 77, 'name': 'John Cleese'}, {'age': 74, 'name': 'Michael Palin'}]
```

Since the `sorted` function takes a callback for the `key` argument we are free
to customize its behavior. All we have to do is define a function that returns
the key we intend to sort by and as long as that's an orderable type Python
will take care of the rest.

## What Does It Mean to Have State?

So, by now we have something of an idea of what callbacks are, how we can use
them, and why, but what's the point of state? State is most easily described as
a memory of prior events. This is the core of what every program does and we
use it all the time, even if we don't realize it. Heck, even saving a variable
involves keeping track of state.

```python
>>> baz = 1  # The Python interpreter is now tracking the state of 'baz'.
>>> print(baz)  # We can recall that state at a later point.
1
```

Basically, we need state if we care to remember what happened previously so
that we can make decisions about what to do next.

## What Normally Happens to State Inside a Callback?

In our first callback function we didn't define any names. To demonstrate what
typically happens to state inside the scope of a callback let's make a function
that creates some state.

```python
def quux():
    plugh = "xyzzy"
    return plugh
```

When we execute this function we get the expected result.

```python
>>> quux()
'xyzzy'
```

After the function is executed we can see that the `plugh` name is not defined.

```python
>>> plugh
Traceback (most recent call last):
  File "<stdin>", line 1, in <module>
NameError: name 'plugh' is not defined
```

This is because when the function is finished executing its frame is removed
from the [call stack][call stack] along with any locally defined variables. By
itself our callback can't remember anything.

## Stateful Callbacks

Alright, so we know what callbacks are, we know what state is. How can we
combine the two to make a callback that retains its state? As we saw above we
can't rely on any state that we define inside our callback. The trick to making
a stateful callback is to rely on names bound to an external scope.

To motivate creating a stateful callback let's say that we still want to sort
users like we did above, only now we have 1 Million users. It's going to take
a while to sort those users, so it would be nice to have a progress report so
we know something is still happening, maybe once per 10,000 users.

### Using Functions

To use names bound to an external scope with a plain ol' function as our
callback we'll need to take advantage of [closures][closures] (which could be
an entirely separate post). Here's a function that allows us to use our
original `by_age` and `by_name` sorters while still giving us progress.

```python
def sort_reporter(func):
    state = dict(count=0)  # We can't just call this 'count'...

    def _sort_reporter(user):
        state['count'] += 1  # Because we'd get an UnboundLocalError here.
        if state['count'] % 10000 == 0:
            print("Sorted {count} users.".format(count=state['count']))
        return func(user)

    return _sort_reporter
```

We can use it like so.

```python
>>> sorted_users = sorted(users, key=sort_reporter(by_name))
Sorted 10000 users.
Sorted 20000 users.
# Lots more of this...
```

How does it work? The key is the `state` dictionary. It lets us keep a mutable
reference to a name defined outside the scope of the actual reporter function,
`_sort_reporter`. As the `sorted` built-in is processing our `users` each new
call to `_sort_reporter` still gets to refer to the original `state`.

<small><b>Note</b>: We could avoid having a `state` dictionary by using Python
3's `nonlocal` keyword, but then I'd miss an opportunity in the [bonus](#bonus)
section.</small>

### Using Classes

If the functional approach doesn't suit you we can also tackle this problem
from an object-oriented angle. Python lets classes define a
[`__call__` method][__call__] which makes them callable. This isn't strictly
necessary for an OOP approach, but when we're making callbacks it's nice to be
able to treat our instances as functions.

```python
class SortReporter:
    def __init__(self, func):
        self.func = func
        self.count = 0

    def __call__(self, user):
        self.count += 1
        if self.count % 10000 == 0:
            print("Sorted {count} users.".format(count=self.count))
        return self.func(user)
```

Just as easy to use as our functional option.

```python
>>> sorted_users = sorted(users, key=SortReporter(by_age))
Sorted 10000 users.
Sorted 20000 users.
# One eternity later...
```

Conceptually, this works for much the same reason that the functional approach
does. The `SortReporter` instance and all its associated state lives on because
the `sorted` built-in is carrying around a reference to it and it just pretends
to be a plain ol' function whenever `sorted` needs it to be one.

### Which Should I Use?

Neither approach is any more or less valid than the other. For this particular
example there isn't much more code or complexity either way. I generally regard
functions as being simpler than classes, so I prefer those when possible, but
classes also provide good structure for more complex callbacks. Try them both!

#### Bonus

As <s>homework</s> a bonus, try instantiating a `SortReporter` and examining
its `__dict__` attribute. Meditate on what you find there and how it relates
to the `state` dictionary in the functional approach.

If you get really bold and want to try for extra credit assign the return value
of the `sort_reporter` function to some variable and examine its `__closure__`
attribute. This may help you explain why the `state` dictionary doesn't
disappear after the `sort_reporter` function is called.

[call stack]: https://en.wikipedia.org/wiki/Call_stack
[closures]: https://en.wikipedia.org/wiki/Closure_(computer_programming)
[__call__]: https://docs.python.org/3/reference/datamodel.html#object.__call__
