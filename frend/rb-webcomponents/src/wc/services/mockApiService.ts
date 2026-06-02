export async function fetchQueryData(queryId: string) {
  // console.log(`Mock API: Fetching data for query ${queryId}`);

  // Example data
  const sampleData = [
    { id: 1, name: "Billy Bob", age: "12", col: "red", dob: "1984-05-14" },
    { id: 2, name: "Mary May", age: "1", col: "blue", dob: "2023-01-20" },
    {
      id: 3,
      name: "Christine Lobowski",
      age: "42",
      col: "green",
      dob: "1982-11-01",
    },
    {
      id: 4,
      name: "Brendon Philips",
      age: "125",
      col: "orange",
      dob: "1900-07-05",
    },
    {
      id: 5,
      name: "Margret Marmajuke",
      age: "16",
      col: "yellow",
      dob: "2008-03-16",
    },
  ];

  // Example columns with more detail, including position for ordering
  const sampleColumns = [
    {
      field: "id",
      title: "ID",
      position: 0,
      width: 60,
      visible: true,
      sorter: "number",
    },
    {
      field: "name",
      title: "Full Name",
      position: 1,
      width: 200,
      visible: true,
      sorter: "string",
    },
    {
      field: "age",
      title: "Age",
      position: 3,
      hozAlign: "left",
      formatter: "progress",
      visible: true,
      sorter: "number",
    },
    {
      field: "col",
      title: "Favourite Color",
      position: 2,
      visible: true,
      sorter: "string",
    },
    {
      field: "dob",
      title: "Date Of Birth",
      position: 4,
      visible: false,
      sorter: "date",
    }, // Example hidden column
  ];

  // Example config reflecting the 4 priority features
  const sampleConfig = {
    // Feature 1: Pagination
    pagination: {
      enabled: true,
      size: 3, // Smaller size for testing pagination
      sizes: [3, 5, 10], // Example sizes
      mode: "local", // Tabulator option: paginationMode
      // alignment: 'right' // This is usually controlled by CSS/theme
    },
    // Feature 3: Sorting
    sorting: {
      // enabled: true, // Implied by sortable columns
      // multiColumn: true, // Tabulator option: sortMode: "local" (default) or "remote"
      initial: [
        // Tabulator option: initialSort
        { column: "name", dir: "asc" },
      ],
    },
    // Feature 4: Appearance
    appearance: {
      // theme: 'default', // Applied via CSS import
      layout: "fitColumns", // Tabulator option: layout
      // headerVisible: true // Tabulator option: headerVisible (true by default)
    },
    // Other direct Tabulator options
    height: "250px", // Adjusted height
  };

  // Simulate API response structure
  return {
    data: sampleData,
    columns: sampleColumns, // Send columns with position info
    config: sampleConfig, // Send nested config
  };
}
