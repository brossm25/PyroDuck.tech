---
title: XHTML Basics
category: Software Security
course: "CYB 240: Application Security"
tags:
  - XHTML
  - HTML
  - XML
  - web development
---

## What it is

XHTML stands for Extensible HyperText Markup Language. It uses HTML
elements with XML syntax rules. Those rules require the document's
structure to be written more strictly.

## Why it matters

Understanding XHTML helps me recognize why some web documents require
more exact syntax than others. Software that processes XHTML as XML
expects a well-formed document and can report an error if the syntax
is incorrect.

## Rules I practiced

In my CYB 240 lab, I learned that XHTML requires:

<ul>
<li>Elements to be properly nested.</li>
<li>Elements to be closed, including empty elements.</li>
<li>HTML element names to be lowercase.</li>
<li>Attribute values to be placed inside quotation marks.</li>
</ul>

## Example

A line break in HTML can be written as:

```html
<br>
```

In XHTML, the empty element is closed:

```html
<br />
```

A properly nested example looks like this:

```html
<p>This is <strong>important</strong> text.</p>
```

The `<strong>` element closes before the paragraph closes.

## Security connection

During the lab, I reviewed a login page and its HTML source from a
pentester's perspective. Looking at page structure can help identify
form fields and understand what the browser sends to an application.

Correct markup alone does not secure a login. The application also
needs appropriate protections when it handles user input.

## Resources

- CYB 240: Application Security - Module One lab, Exploring HTML.
