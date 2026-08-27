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
 * Represents a product category in the Northwind database. Categories classify
 * products into logical groups.
 */
@Entity
@Table(name = "\"Categories\"")
public class Category {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "\"CategoryID\"")
	private Integer categoryId;

	@Column(name = "\"CategoryName\"", length = 15, nullable = false)
	private String categoryName;

	@JdbcTypeCode(SqlTypes.LONGVARCHAR)
	@Column(name = "\"Description\"")
	private String description;

	@Lob
	@Column(name = "\"Picture\"")
	private byte[] picture;

	@OneToMany(mappedBy = "category", fetch = FetchType.LAZY)
	private List<Product> products = new ArrayList<>();

	/**
	 * Default constructor required by JPA
	 */
	public Category() {
	}

	/**
	 * Create a category with name and description
	 */
	public Category(String categoryName, String description) {
		this.categoryName = categoryName;
		this.description = description;
	}

	// Getters and setters
	public Integer getCategoryId() {
		return categoryId;
	}

	public void setCategoryId(Integer categoryId) {
		this.categoryId = categoryId;
	}

	public String getCategoryName() {
		return categoryName;
	}

	public void setCategoryName(String categoryName) {
		this.categoryName = categoryName;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public byte[] getPicture() {
		return picture;
	}

	public void setPicture(byte[] picture) {
		this.picture = picture;
	}

	public List<Product> getProducts() {
		return products;
	}

	public void setProducts(List<Product> products) {
		this.products = products;
	}

	/**
	 * Add a product to this category
	 */
	public void addProduct(Product product) {
		products.add(product);
		product.setCategory(this);
	}

	/**
	 * Remove a product from this category
	 */
	public void removeProduct(Product product) {
		products.remove(product);
		product.setCategory(null);
	}

	@Override
	public boolean equals(Object o) {
		if (this == o)
			return true;
		if (o == null || getClass() != o.getClass())
			return false;
		Category category = (Category) o;
		return Objects.equals(categoryId, category.categoryId);
	}

	@Override
	public int hashCode() {
		return Objects.hash(categoryId);
	}

	@Override
	public String toString() {
		return "Category{" + "categoryId=" + categoryId + ", categoryName='" + categoryName + '\'' + '}';
	}
}