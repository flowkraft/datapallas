// ═══════════════════════════════════════════════════════════════════════════
// Student Progress — how far each student has got
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per student, with the program, the country and the
// year they started, and the enrollments behind them.
//
// Joins: cube_demo.school_enrollments on student_id, one_to_many. It is a LEFT
// join, so a student with no enrollment is still in the answer.
//
// Grain: one row per student. Students counts students, once each however many
// enrollments are joined to them. CoursesTaken is a value of the student, not a
// sum: a small query on that student's own enrollments, so it can be ticked as
// a field and grouped by ("how many students took 5 courses"). A student with
// no enrollment answers 0. AverageScore averages the scores of the enrollments
// joined in; enrollments with no score yet do not count.
//
// What it can answer:
//   - how far each student has got, courses taken and average score, and the
//     named filter intake_2026 (45 students, one page);
//   - how many courses students take, as a spread (CoursesTaken as a field);
//   - who has not started a single course, with the not_started segment;
//   - how many students there are, by program, country and start year.
//
// CoursesTaken is written as a correlated subquery, which ClickHouse does not
// run: there it is refused with a sentence, never answered wrongly.
//
// Data: cube_demo.school_students (300, of whom 294 have at least one
// enrollment) and cube_demo.school_enrollments (2,400 over 6 terms).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_students'
  title 'Student Progress'
  description 'One row per student: the program, the start year, the courses taken and the average score'
  currency 'EUR'

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
    name 'StartYear'
    title 'Start Year'
    description 'The year the student started'
    sql '${CUBE}.start_year'
    type 'number'
  }
  dimension {
    name 'CoursesTaken'
    title 'Courses Taken'
    description 'How many courses this student is enrolled in. 0 for a student who has not started'
    sql '${cube_demo.school_enrollments.count}'
    type 'number'
    sub_query true
  }

  measure {
    name 'Students'
    title 'Students'
    description 'How many students there are'
    type 'count'
  }
  measure {
    name 'AverageScore'
    title 'Average Score'
    description 'The average score of the enrollments. Enrollments with no score yet do not count'
    sql 'cube_demo.school_enrollments.score'
    type 'avg'
  }

  segment {
    name 'intake_2026'
    title 'Intake 2026'
    description 'The students who started in 2026'
    sql '${CUBE}.start_year = 2026'
  }
  segment {
    name 'not_started'
    title 'Not started'
    description 'The students with no enrollment at all'
    sql '${CUBE}.student_id NOT IN (SELECT e.student_id FROM cube_demo.school_enrollments e WHERE e.student_id IS NOT NULL)'
  }
}
