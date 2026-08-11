package com.flowkraft.iam.dtos;

import jakarta.validation.constraints.NotBlank;

/** Body of {@code POST /api/auth/login}. */
public record LoginRequestDto(@NotBlank String username, @NotBlank String password) {
}
