package com.flowkraft.iam.dtos;

/** Just enough of a group to name it — what the Users screen shows in its Groups column. */
public record GroupRefDto(
		long id,
		String name) {
}
