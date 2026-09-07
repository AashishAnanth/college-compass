# Course rules

One file per course, describing how the syllabus says the grade is computed.
`example.json` documents the format; see `engine/model.py` for the schema.

Your own rule files are gitignored — they name real courses and carry real
Canvas assignment-group ids. Keep them here locally; they are not meant to be
published.

To find the `canvas_group_ids` for a course, open your Canvas tab and visit:

```
/api/v1/courses/<course_id>/assignment_groups?include[]=assignments
```

`engine/extract.py` can draft one of these from a syllabus, but it leaves
`canvas_group_ids` empty — mapping categories to Canvas groups is still manual.
