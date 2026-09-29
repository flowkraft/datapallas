// ═══════════════════════════════════════════════════════════════════════════
// Student Enrollments — who took what, and how it went
// ═══════════════════════════════════════════════════════════════════════════
//
// What it holds: one row per student and course, with the grade band, the score
// and the attendance on it.
//
// Joins: cube_demo.school_students on student_id and cube_demo.school_courses
// on course_id, both many_to_one. Both are LEFT joins, so an enrollment whose
// student or course row is missing still counts.
//
// Grain: one row per enrollment. Enrollments counts enrollments; Students
// counts the different students behind them, which is why a program can show
// more enrollments than students.
//
// What it can answer:
//   - how the terms went, by grade band, program, department and course
//     (Enrollments, AverageScore, AvgAttendance, Students);
//   - who the student is (FirstName, LastName, Student, Program,
//     StudentCountry) and what the course is (Course, CourseCode, Department,
//     Credits);
//   - the 2026 intake on its own, with the intake_2026 segment.
//
// Data: cube_demo.school_enrollments (2,400), cube_demo.school_students (300,
// of whom 294 have at least one enrollment) and cube_demo.school_courses (24).
// ═══════════════════════════════════════════════════════════════════════════

cube {
  sql_table 'cube_demo.school_enrollments'
  title 'Student Enrollments'
  description 'One row per student and course: the term, the grade band and the score'
  currency 'EUR'

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
    name 'FirstName'
    title 'First Name'
    description 'The student first name'
    sql 'cube_demo.school_students.first_name'
    type 'string'
  }
  dimension {
    name 'LastName'
    title 'Last Name'
    description 'The student last name'
    sql 'cube_demo.school_students.last_name'
    type 'string'
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

  segment {
    name 'intake_2026'
    title '2026 intake'
    description 'Enrollments of the students who started in 2026'
    sql 'cube_demo.school_students.start_year = 2026'
  }
}
