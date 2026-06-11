package com.timesheet.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import com.timesheet.backend.repository.UserRepository;
import com.timesheet.backend.model.User;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Collections;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private UserRepository userRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");
        final String jwt;
        final String empId;

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        jwt = authHeader.substring(7);
        try {
            empId = jwtUtil.extractEmpId(jwt);
            if (empId != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                String role = jwtUtil.extractRole(jwt);

                if (jwtUtil.validateToken(jwt, empId)) {
                    java.util.Optional<User> uOpt = userRepository.findByEmpId(empId);

                    if (uOpt.isPresent()) {
                        User user = uOpt.get();

                        // ── Account disabled check ──────────────────────────────────────
                        if (!user.isEnabled()) {
                            response.sendError(HttpServletResponse.SC_FORBIDDEN, "Your account has been deactivated.");
                            return;
                        }

                        // ── Stale session check: reject tokens issued before last password change ──
                        if (user.getPasswordChangedAt() != null) {
                            java.util.Date tokenIssuedAt = jwtUtil.extractIssuedAt(jwt);
                            if (tokenIssuedAt != null) {
                                LocalDateTime tokenIat = tokenIssuedAt.toInstant()
                                        .atZone(ZoneId.systemDefault())
                                        .toLocalDateTime();
                                // If token was issued BEFORE the password was changed → stale session
                                if (tokenIat.isBefore(user.getPasswordChangedAt())) {
                                    response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                                    response.setContentType("application/json");
                                    response.getWriter().write(
                                        "{\"error\":\"SESSION_INVALIDATED\"," +
                                        "\"message\":\"Your password has been changed. Please log in again using your new credentials.\"}"
                                    );
                                    return;
                                }
                            }
                        }

                        // ── All checks passed → authenticate ────────────────────────────
                        UsernamePasswordAuthenticationToken authToken = new UsernamePasswordAuthenticationToken(
                                empId, null, Collections.singletonList(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()))
                        );
                        authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                        SecurityContextHolder.getContext().setAuthentication(authToken);
                    }
                }
            }
        } catch (Exception e) {
            // Invalid / unparseable token — silently skip, request proceeds unauthenticated
        }

        filterChain.doFilter(request, response);
    }
}

