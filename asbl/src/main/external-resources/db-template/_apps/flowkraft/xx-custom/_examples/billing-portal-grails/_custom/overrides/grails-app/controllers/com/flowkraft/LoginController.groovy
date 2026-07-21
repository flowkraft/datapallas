package com.flowkraft

class LoginController {

    AuthService authService

    def index() {
        // If already logged in, skip to the right area.
        if (session.role == 'ADMIN') { redirect(uri: '/admin'); return }
        if (session.userId)          { redirect(uri: '/portal'); return }
        [:]
    }

    def authenticate() {
        def user = authService.authenticate(params.username, params.password)
        if (!user) {
            flash.error = 'Invalid username or password'
            redirect(action: 'index')
            return
        }
        session.userId     = user.id
        session.username   = user.username
        session.role       = user.role
        session.customerId = user.customer?.id
        redirect(uri: user.role == 'ADMIN' ? '/admin' : '/portal')
    }

    def logout() {
        session.invalidate()
        redirect(uri: '/login')
    }
}
