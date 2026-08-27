package com.sourcekraft.documentburster.common.db.northwind.entities;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;


/**
 * Represents a supplier company in the Northwind database. Suppliers provide
 * products to the company for resale.
 */
@Entity
@Table(name = "\"Suppliers\"")
public class Supplier {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "\"SupplierID\"")
	private Integer supplierId;

	@Column(name = "\"CompanyName\"", length = 40, nullable = false)
	private String companyName;

	@Column(name = "\"ContactName\"", length = 30)
	private String contactName;

	@Column(name = "\"ContactTitle\"", length = 30)
	private String contactTitle;

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

	@Column(name = "\"Phone\"", length = 24)
	private String phone;

	@Column(name = "\"Fax\"", length = 24)
	private String fax;

	@Column(name = "\"Email\"", length = 225)
	private String email;

	@JdbcTypeCode(SqlTypes.LONGVARCHAR)
	@Column(name = "\"HomePage\"")
	private String homePage;

	@OneToMany(mappedBy = "supplier", fetch = FetchType.LAZY)
	private List<Product> products = new ArrayList<>();

	/**
	 * Default constructor required by JPA
	 */
	public Supplier() {
	}

	/**
	 * Create a supplier with essential information
	 */
	public Supplier(String companyName, String contactName) {
		this.companyName = companyName;
		this.contactName = contactName;
	}

	/**
	 * Create a supplier with complete contact information
	 */
	public Supplier(String companyName, String contactName, String contactTitle, String address, String city,
			String country, String phone) {
		this.companyName = companyName;
		this.contactName = contactName;
		this.contactTitle = contactTitle;
		this.address = address;
		this.city = city;
		this.country = country;
		this.phone = phone;
	}

	// Getters and setters
	public Integer getSupplierId() {
		return supplierId;
	}

	public void setSupplierId(Integer supplierId) {
		this.supplierId = supplierId;
	}

	public String getCompanyName() {
		return companyName;
	}

	public void setCompanyName(String companyName) {
		this.companyName = companyName;
	}

	public String getContactName() {
		return contactName;
	}

	public void setContactName(String contactName) {
		this.contactName = contactName;
	}

	public String getContactTitle() {
		return contactTitle;
	}

	public void setContactTitle(String contactTitle) {
		this.contactTitle = contactTitle;
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

	public String getFax() {
		return fax;
	}

	public void setFax(String fax) {
		this.fax = fax;
	}

	public String getEmail() {
		return email;
	}

	public void setEmail(String email) {
		this.email = email;
	}

	public String getHomePage() {
		return homePage;
	}

	public void setHomePage(String homePage) {
		this.homePage = homePage;
	}

	public List<Product> getProducts() {
		return products;
	}

	public void setProducts(List<Product> products) {
		this.products = products;
	}

	/**
	 * Add a product to this supplier
	 */
	public void addProduct(Product product) {
		products.add(product);
		product.setSupplier(this);
	}

	/**
	 * Remove a product from this supplier
	 */
	public void removeProduct(Product product) {
		products.remove(product);
		product.setSupplier(null);
	}

	/**
	 * Get the full contact information as a formatted string
	 */
	public String getFullContactInfo() {
		StringBuilder sb = new StringBuilder();
		if (contactName != null) {
			sb.append(contactName);
			if (contactTitle != null) {
				sb.append(", ").append(contactTitle);
			}
		}
		return sb.toString();
	}

	/**
	 * Get the full address as a formatted string
	 */
	public String getFullAddress() {
		StringBuilder sb = new StringBuilder();
		if (address != null)
			sb.append(address);

		if (city != null) {
			if (sb.length() > 0)
				sb.append(", ");
			sb.append(city);
		}

		if (region != null) {
			if (sb.length() > 0)
				sb.append(", ");
			sb.append(region);
		}

		if (postalCode != null) {
			if (sb.length() > 0)
				sb.append(" ");
			sb.append(postalCode);
		}

		if (country != null) {
			if (sb.length() > 0)
				sb.append(", ");
			sb.append(country);
		}

		return sb.toString();
	}

	@Override
	public boolean equals(Object o) {
		if (this == o)
			return true;
		if (o == null || getClass() != o.getClass())
			return false;
		Supplier supplier = (Supplier) o;
		return Objects.equals(supplierId, supplier.supplierId);
	}

	@Override
	public int hashCode() {
		return Objects.hash(supplierId);
	}

	@Override
	public String toString() {
		return "Supplier{" + "supplierId=" + supplierId + ", companyName='" + companyName + '\'' + ", contactName='"
				+ contactName + '\'' + ", productCount=" + (products != null ? products.size() : 0) + '}';
	}
}