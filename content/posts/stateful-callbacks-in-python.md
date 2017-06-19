+++
title = "Stateful Callbacks in Python"
description = ""
date = "2017-06-18T17:23:00-08:00"
tags = ["Python", "callbacks"]
+++
# What's a Callback?

If you're unfamiliar with what a callback is, don't worry, we can sort that out
quickly. If callbacks are old hat for you you might want to skip to
[the interesting bit](#stateful-callbacks).

Simply put, a callback is a function that is passed as an argument to
another function which may execute it.

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

# Why Should I Use A Callback?

There are many reasons to use callbacks. For me, the most compelling is
customization. Let's take a look at a Python built-in as an example. Say we
have a list of users as dictionaries with a `name` and an `age`:

```python
users = [
    dict(age=28, name='Emma'),
    dict(age=27, name='Tucker'),
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
def by_age(d):
    return d['age']

def by_name(d):
    return d['name']
```

Armed with these callbacks we can sort our users.

```python
>>> sorted(users, key=by_age)
[{'age': 27, 'name': 'Tucker'}, {'age': 28, 'name': 'Emma'}]
>>> sorted(users, key=by_name)
[{'age': 28, 'name': 'Emma'}, {'age': 27, 'name': 'Tucker'}]
```

Since the `sorted` function takes a callback for the `key` argument we are free
to customize its behavior. All we have to do is define a function that returns
the key we intend to sort by and as long as that's an orderable type Python
will take care of the rest.

# What Does It Mean to Have State?

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

# Stateful Callbacks

Alright, we know what callbacks are, we know what state is. How can we combine
the two? To demonstrate why we might want to do this let's add an extra
requirement to our sorting. We still want to sort by name, but if two users
have the same name, then we want to sort them by age.

Python's built-in sorting algorithm is [Timsort][Timsort], which is a
[stable sorting algorithm][stable sorting algorithm]. That means the relative
order of elements is preserved during sorting. If we add more users with the
same name

```python
>>> users.extend([
    dict(age=117, name='John'),
    dict(age=77, name='John'),
])
```

and use our `by_name` function above

```python
>>> sorted(users, key=by_name)
[{'age': 28, 'name': 'Emma'},
 {'age': 117,'name': 'John'},
 {'age': 77, 'name': 'John'},
 {'age': 27, 'name': 'Tucker'}]
```

we can see that our users with the same name are sorted in the order we
inserted them. This doesn't meet our requirements.

## Using Functions

## Using Classes

# TODO: Mention `operator.itemgetter`
# TODO: Mention usefulness with side effects

[Timsort]: https://en.wikipedia.org/wiki/Timsort
[stable sorting algorithm]: https://en.wikipedia.org/wiki/Sorting_algorithm#Stability
