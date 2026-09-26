// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 6 — Grades
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "how many students made the Dean's List, passed or failed?"
// Who asks it: the dean, at the end of each term.
//
// What the cube does here: a label worked out from a value. Grade is not a
// column — it is a band the cube reads off the score, and the label (Dean's
// List, apostrophe included) is written for every database the same way.
//
// The current term, 2026 Autumn, has no scores yet: those 480 enrollments land
// in "In progress", which is what the else branch is for.
//
// Data: cube_demo.school_enrollments (2,400 enrollments over 6 terms).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_enrollments'
  title 'Grades'
  description 'Enrollments by grade band and by term'

  dimension {
    name 'EnrollmentId'
    title 'Enrollment'
    description 'The enrollment number'
    sql '${CUBE}.enrollment_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Term'
    title 'Term'
    description 'The term the student took the course in'
    sql '${CUBE}.term'
    type 'string'
  }
  dimension {
    name 'Grade'
    title 'Grade'
    description "The band the score falls in: Dean's List from 90, Passed from 60, Failed below it, and In progress while there is no score yet"
    case_ {
      when sql: '${CUBE}.score >= 90', label: "Dean's List"
      when sql: '${CUBE}.score >= 60', label: 'Passed'
      when sql: '${CUBE}.score IS NOT NULL', label: 'Failed'
      else_ label: 'In progress'
    }
  }

  measure {
    name 'Enrollments'
    title 'Enrollments'
    description 'How many enrollments there are'
    type 'count'
  }
  measure {
    name 'AverageScore'
    title 'Average Score'
    description 'The average score. Enrollments with no score yet do not count'
    sql '${CUBE}.score'
    type 'avg'
  }
}
