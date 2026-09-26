// ═══════════════════════════════════════════════════════════════════════════
// Cube Story 18 — Student Progress
// ═══════════════════════════════════════════════════════════════════════════
//
// The question: "for this year's intake, how many courses has each student
// taken, at what average score, and who has not started yet?"
// Who asks it: the academic advisor.
//
// What the cube does here: one value per row, worked out on another table.
// Courses Taken and Average Score are not sums over joined rows: each one is a
// small query on the student's own enrollments, so a student stays one row and
// a student with no enrollment answers 0 and nothing.
//
// The intake_2026 segment keeps the answer to one page: 45 students.
//
// Data: cube_demo.school_students (300), cube_demo.school_enrollments (2,400).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_students'
  title 'Student Progress'
  description 'How far each student has got: courses taken and average score'

  join {
    name 'cube_demo.school_enrollments'
    title 'Enrollments'
    description 'The courses the student is enrolled in'
    sql '${CUBE}.student_id = cube_demo.school_enrollments.student_id'
    relationship 'one_to_many'
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
    name 'FirstName'
    title 'First Name'
    description 'The student first name'
    sql '${CUBE}.first_name'
    type 'string'
  }
  dimension {
    name 'LastName'
    title 'Last Name'
    description 'The student last name'
    sql '${CUBE}.last_name'
    type 'string'
  }
  dimension {
    name 'Program'
    title 'Program'
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
    name 'CoursesTaken'
    title 'Courses Taken'
    description 'How many courses this student is enrolled in'
    sql '${cube_demo.school_enrollments.count}'
    type 'number'
    sub_query true
  }
  dimension {
    name 'AverageScore'
    title 'Average Score'
    description 'What this student scores on average. Empty while there is no score yet'
    sql '${cube_demo.school_enrollments.avg_score}'
    type 'number'
    sub_query true
  }

  measure {
    name 'Students'
    title 'Students'
    description 'How many students there are'
    type 'count'
  }

  segment {
    name 'intake_2026'
    title 'Intake 2026'
    description 'The students who started in 2026'
    sql '${CUBE}.start_year = 2026'
  }
}

cube('cube_demo.school_enrollments') {
  sql_table 'cube_demo.school_enrollments'
  title 'Enrollments'
  description 'One row per student and course. Not in the picker: it is here for the two per-student values'
  public_ false

  dimension {
    name 'EnrollmentId'
    title 'Enrollment Id'
    description 'The enrollment number'
    sql '${CUBE}.enrollment_id'
    type 'number'
    primary_key true
  }
  dimension {
    name 'Term'
    title 'Term'
    description 'The term the course runs in'
    sql '${CUBE}.term'
    type 'string'
  }

  measure {
    name 'Enrollments'
    title 'Enrollments'
    description 'How many enrollments there are'
    type 'count'
  }
  measure {
    name 'avg_score'
    title 'Average Score'
    description 'The average score of the enrollments'
    sql '${CUBE}.score'
    type 'avg'
  }
}
