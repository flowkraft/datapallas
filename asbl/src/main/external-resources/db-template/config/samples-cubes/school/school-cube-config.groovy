// ═══════════════════════════════════════════════════════════════════════════
// School — students and their enrollments
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: two cubes. Students is the student body, one row per student,
// each carrying two values worked out on their own enrollments; Enrollments is
// one row per student and course, with the course and the grade band.
//
// Grain: one row per student, and one row per enrollment. Ticking Courses Taken
// on Students does not turn a student into several rows: each of those two
// fields is a small query on that student's enrollments, so a student with no
// enrollment answers 0 and nothing at all.
//
// Joins: Students to cube_demo.school_enrollments (one_to_many), which is what
// the two per-student values read; Enrollments to cube_demo.school_students and
// cube_demo.school_courses, both many_to_one.
//
// What they can answer:
//   - how many students there are, by program, country and intake year, and the
//     named filter intake_2026 (45 students, one page);
//   - how far each student has got: CoursesTaken and AverageScore, per student;
//   - how the terms went: enrollments and average score by Term, and by Grade —
//     a band the cube reads off the score, Dean's List from 90, Passed from 60,
//     Failed below it, and In progress for the 480 enrollments of the current
//     term that have no score yet;
//   - and the question the two cubes could not answer apart: the grade band by
//     program, by department and by course.
//
// Data: cube_demo.school_students (300), cube_demo.school_enrollments (2,400
// over 6 terms), cube_demo.school_courses (24).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_students'
  title 'Students'
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
    name 'StartYear'
    title 'Start Year'
    description 'The year the student started'
    sql '${CUBE}.start_year'
    type 'number'
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
    sql '${cube_demo.school_enrollments.AverageScore}'
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
  description 'One row per student and course: the term, the grade band and the score'

  join {
    name 'cube_demo.school_students'
    title 'Students'
    description 'The student who took the course'
    sql '${CUBE}.student_id = cube_demo.school_students.student_id'
    relationship 'many_to_one'
  }
  join {
    name 'cube_demo.school_courses'
    title 'Courses'
    description 'The course the student took'
    sql '${CUBE}.course_id = cube_demo.school_courses.course_id'
    relationship 'many_to_one'
  }

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
  dimension {
    name 'AttendancePct'
    title 'Attendance %'
    description 'How much of the course the student attended'
    sql '${CUBE}.attendance_pct'
    type 'number'
  }
  dimension {
    name 'Student'
    title 'Student'
    description 'The student who took the course'
    sql 'cube_demo.school_students.last_name'
    type 'string'
  }
  dimension {
    name 'Program'
    title 'Program'
    description 'The program the student is in'
    sql 'cube_demo.school_students.program'
    type 'string'
  }
  dimension {
    name 'StudentCountry'
    title 'Student Country'
    description 'The country the student comes from'
    sql 'cube_demo.school_students.country'
    type 'string'
  }
  dimension {
    name 'Course'
    title 'Course'
    description 'The course title'
    sql 'cube_demo.school_courses.title'
    type 'string'
  }
  dimension {
    name 'CourseCode'
    title 'Course Code'
    description 'The course code'
    sql 'cube_demo.school_courses.code'
    type 'string'
  }
  dimension {
    name 'Department'
    title 'Department'
    description 'The department the course belongs to'
    sql 'cube_demo.school_courses.department'
    type 'string'
  }
  dimension {
    name 'Credits'
    title 'Credits'
    description 'How many credits the course is worth'
    sql 'cube_demo.school_courses.credits'
    type 'number'
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
  measure {
    name 'AvgAttendance'
    title 'Average Attendance %'
    description 'How much of a course a student attends, on average'
    sql '${CUBE}.attendance_pct'
    type 'avg'
  }
  measure {
    name 'Students'
    title 'Students'
    description 'How many different students are enrolled'
    sql '${CUBE}.student_id'
    type 'count_distinct'
  }
}
