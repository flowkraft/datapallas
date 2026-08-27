package com.sourcekraft.documentburster.common.db.northwind.entities;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;


/**
 * Represents customer demographic categories in the Northwind database.
 * Used to classify customers into marketing segments.
 */
@Entity
@Table(name = "\"CustomerDemographics\"")
public class CustomerDemographics {

    @Id
    @Column(name = "\"CustomerTypeID\"", length = 10)
    private String customerTypeId;
    
    @JdbcTypeCode(SqlTypes.LONGVARCHAR)
    @Column(name = "\"CustomerDesc\"")
    private String customerDesc;

    @ManyToMany(mappedBy = "demographics", fetch = FetchType.LAZY)
    private List<Customer> customers = new ArrayList<>();

    /**
     * Default constructor required by JPA
     */
    public CustomerDemographics() {
    }
    
    /**
     * Create a customer demographic with ID and description
     */
    public CustomerDemographics(String customerTypeId, String customerDesc) {
        this.customerTypeId = customerTypeId;
        this.customerDesc = customerDesc;
    }

    // Getters and setters
    public String getCustomerTypeId() {
        return customerTypeId;
    }

    public void setCustomerTypeId(String customerTypeId) {
        this.customerTypeId = customerTypeId;
    }

    public String getCustomerDesc() {
        return customerDesc;
    }

    public void setCustomerDesc(String customerDesc) {
        this.customerDesc = customerDesc;
    }

    public List<Customer> getCustomers() {
        return customers;
    }

    public void setCustomers(List<Customer> customers) {
        this.customers = customers;
    }
    
    /**
     * Add a customer to this demographic
     */
    public void addCustomer(Customer customer) {
        customers.add(customer);
        if (!customer.getDemographics().contains(this)) {
            customer.getDemographics().add(this);
        }
    }
    
    /**
     * Remove a customer from this demographic
     */
    public void removeCustomer(Customer customer) {
        customers.remove(customer);
        customer.getDemographics().remove(this);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        CustomerDemographics that = (CustomerDemographics) o;
        return Objects.equals(customerTypeId, that.customerTypeId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(customerTypeId);
    }

    @Override
    public String toString() {
        return "CustomerDemographics{" +
                "customerTypeId='" + customerTypeId + '\'' +
                ", customerDesc='" + (customerDesc != null ? customerDesc.substring(0, Math.min(customerDesc.length(), 20)) + "..." : null) + '\'' +
                '}';
    }
}