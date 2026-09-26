// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 19 — Students per Program, a first draft
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "how many students are in each program?"
// Who asks it: the registrar.
//
// What the cube does here: it is wrong on purpose. This is the cube as a
// first-time author writes it, with a few mistakes in it — two spellings that
// are nearly right, a measure type that does not exist, and a drill path naming
// a dimension that is not there. The mistakes are caught and explained, and
// everything else still answers: Program + Students gives the four programs,
// 75 students each.
//
// Do not fix this file. Its mistakes are what it is for.
//
// Data: cube_demo.school_students (300), cube_demo.school_enrollments (2,400).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_students'
  title 'Students per Program'
  description 'A first draft, with the mistakes a first draft has'

  join {
    name 'cube_demo.school_enrollments'
    title 'Enrollments'
    description 'The courses the student is enrolled in'
    sql '${CUBE}.student_id = cube_demo.school_enrollments.student_id'
    relationshp 'one_to_many'
  }

  dimension {
    name 'StudentId'
    title 'Student Id'
    description 'The student number'
    sql '${CUBE}.student_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Program'
    titel 'Program'
    description 'The program the student is in'
    sql '${CUBE}.program'
    type 'string'
  }
  dimension {
    name 'Country'
    title 'Country'
    description 'The country the student comes from'
    sql '${CUBE}.country'
    type 'string'
  }
  dimension {
    name 'StartYear'
    title 'Start Year'
    description 'The year the student started'
    sql '${CUBE}.start_year'
    type 'number'
  }

  measure {
    name 'Students'
    title 'Students'
    description 'How many students there are'
    type 'count'
  }
  measure {
    name 'MedianScore'
    title 'Median Score'
    description 'The middle score of the enrollments'
    sql 'cube_demo.school_enrollments.score'
    type 'median'
  }

  hierarchy {
    name 'where_from'
    title 'Where From'
    description 'Country, then the city inside it'
    levels 'Country', 'City'
  }
}
