package com.sourcekraft.documentburster.common.db.northwind.entities;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Represents an employee in the Northwind database.
 * Employees manage orders and have territories they are responsible for.
 */
@Entity
@Table(name = "\"Employees\"")
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "\"EmployeeID\"")
    private Integer employeeId;
    
    @Column(name = "\"LastName\"", length = 20, nullable = false)
    private String lastName;
    
    @Column(name = "\"FirstName\"", length = 10, nullable = false)
    private String firstName;
    
    @Column(name = "\"Title\"", length = 30)
    private String title;
    
    @Column(name = "\"TitleOfCourtesy\"", length = 25)
    private String titleOfCourtesy;
    
    @Column(name = "\"BirthDate\"")
    private LocalDate birthDate;
    
    @Column(name = "\"HireDate\"")
    private LocalDate hireDate;
    
    @Column(name = "\"Address\"", length = 60)
    private String address;
    
    @Column(name = "\"City\"", length = 15)
    private String city;
    
    @Column(name = "\"Region\"", length = 15)
    private String region;
    
    @Column(name = "\"PostalCode\"", length = 10)
    private String postalCode;
    
    @Column(name = "\"Country\"", length = 15)
    private String country;
    
    @Column(name = "\"HomePhone\"", length = 24)
    private String phone;
    
    @Column(name = "\"Extension\"", length = 4)
    private String extension;
    
    @Column(name = "\"Mobile\"", length = 24)
    private String mobile;
    
    @Column(name = "\"Email\"", length = 225)
    private String email;
    
    @Lob
    @Column(name = "\"Photo\"")
    private byte[] photo;
    
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "\"Notes\"")
    private String notes;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "\"ReportsTo\"")
    private Employee manager;
    
    @Column(name = "\"PhotoPath\"", length = 255)
    private String photoPath;

    @OneToMany(mappedBy = "manager", fetch = FetchType.LAZY)
    private List<Employee> directReports = new ArrayList<>();
    
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
        name = "\"EmployeeTerritories\"", 
        joinColumns = @JoinColumn(name = "\"EmployeeID\""), 
        inverseJoinColumns = @JoinColumn(name = "\"TerritoryID\"")
    )
    private List<Territory> territories = new ArrayList<>();
    
    @OneToMany(mappedBy = "employee", fetch = FetchType.LAZY)
    private List<Order> orders = new ArrayList<>();

    /**
     * Default constructor required by JPA
     */
    public Employee() {
    }
    
    /**
     * Create an employee with essential information
     */
    public Employee(String firstName, String lastName, String title) {
        this.firstName = firstName;
        this.lastName = lastName;
        this.title = title;
    }

    // Getters and setters
    public Integer getEmployeeId() {
        return employeeId;
    }

    public void setEmployeeId(Integer employeeId) {
        this.employeeId = employeeId;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getTitleOfCourtesy() {
        return titleOfCourtesy;
    }

    public void setTitleOfCourtesy(String titleOfCourtesy) {
        this.titleOfCourtesy = titleOfCourtesy;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public void setBirthDate(LocalDate birthDate) {
        this.birthDate = birthDate;
    }

    public LocalDate getHireDate() {
        return hireDate;
    }

    public void setHireDate(LocalDate hireDate) {
        this.hireDate = hireDate;
    }

    public String getAddress() {
        return address;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getPostalCode() {
        return postalCode;
    }

    public void setPostalCode(String postalCode) {
        this.postalCode = postalCode;
    }

    public String getCountry() {
        return country;
    }

    public void setCountry(String country) {
        this.country = country;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getExtension() {
        return extension;
    }

    public void setExtension(String extension) {
        this.extension = extension;
    }

    public String getMobile() {
        return mobile;
    }

    public void setMobile(String mobile) {
        this.mobile = mobile;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public byte[] getPhoto() {
        return photo;
    }

    public void setPhoto(byte[] photo) {
        this.photo = photo;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public Employee getManager() {
        return manager;
    }

    public void setManager(Employee manager) {
        this.manager = manager;
    }

    public String getPhotoPath() {
        return photoPath;
    }

    public void setPhotoPath(String photoPath) {
        this.photoPath = photoPath;
    }

    public List<Employee> getDirectReports() {
        return directReports;
    }

    public void setDirectReports(List<Employee> directReports) {
        this.directReports = directReports;
    }

    public List<Territory> getTerritories() {
        return territories;
    }

    public void setTerritories(List<Territory> territories) {
        this.territories = territories;
    }
    
    public List<Order> getOrders() {
        return orders;
    }

    public void setOrders(List<Order> orders) {
        this.orders = orders;
    }
    
    /**
     * Add a direct report to this employee
     */
    public void addDirectReport(Employee employee) {
        directReports.add(employee);
        employee.setManager(this);
    }
    
    /**
     * Remove a direct report from this employee
     */
    public void removeDirectReport(Employee employee) {
        directReports.remove(employee);
        employee.setManager(null);
    }
    
    /**
     * Add a territory to this employee
     */
    public void addTerritory(Territory territory) {
        territories.add(territory);
        territory.getEmployees().add(this);
    }
    
    /**
     * Remove a territory from this employee
     */
    public void removeTerritory(Territory territory) {
        territories.remove(territory);
        territory.getEmployees().remove(this);
    }
    
    /**
     * Add an order to this employee
     */
    public void addOrder(Order order) {
        orders.add(order);
        order.setEmployee(this);
    }
    
    /**
     * Remove an order from this employee
     */
    public void removeOrder(Order order) {
        orders.remove(order);
        order.setEmployee(null);
    }
    
    /**
     * Get the full name of the employee
     */
    public String getFullName() {
        return titleOfCourtesy != null 
            ? titleOfCourtesy + " " + firstName + " " + lastName 
            : firstName + " " + lastName;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Employee employee = (Employee) o;
        return Objects.equals(employeeId, employee.employeeId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(employeeId);
    }

    @Override
    public String toString() {
        return "Employee{" +
                "employeeId=" + employeeId +
                ", fullName='" + getFullName() + '\'' +
                ", title='" + title + '\'' +
                '}';
    }
}