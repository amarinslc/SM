// NetworkUtility.swift
import Foundation
import Combine
import SwiftUI

// Utility class to help with network operations and diagnostics
class NetworkUtility {
    static let shared = NetworkUtility()
    
    private init() {}
    
    // Check network connectivity to the server
    func checkServerConnectivity() -> AnyPublisher<Bool, Never> {
        print("🌐 Checking server connectivity...")
        
        guard let url = URL(string: "https://dbsocial.replit.app/api/storage/health") else {
            return Just(false).eraseToAnyPublisher()
        }
        
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        
        return URLSession.shared.dataTaskPublisher(for: request)
            .map { data, response -> Bool in
                guard let httpResponse = response as? HTTPURLResponse else {
                    return false
                }
                return httpResponse.statusCode == 200
            }
            .replaceError(with: false)
            .handleEvents(
                receiveOutput: { success in
                    if success {
                        print("✅ Server is reachable")
                    } else {
                        print("❌ Server is unreachable")
                    }
                }
            )
            .eraseToAnyPublisher()
    }
    
    // Check if we have valid auth cookies
    func checkAuthCookies() -> Bool {
        guard let baseURL = URL(string: "https://dbsocial.replit.app") else {
            return false
        }
        
        let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) ?? []
        let authCookies = cookies.filter { $0.name.contains("session") || $0.name.contains("auth") }
        
        print("🍪 Found \(authCookies.count) auth cookies out of \(cookies.count) total cookies")
        
        return !authCookies.isEmpty
    }
    
    // Log all cookies for debugging
    func logAllCookies() {
        guard let baseURL = URL(string: "https://dbsocial.replit.app") else {
            print("❌ Invalid base URL")
            return
        }
        
        let cookies = HTTPCookieStorage.shared.cookies(for: baseURL) ?? []
        print("📝 Cookies for \(baseURL.host ?? "unknown host"):")
        
        if cookies.isEmpty {
            print("  - No cookies found")
        } else {
            for (index, cookie) in cookies.enumerated() {
                print("  \(index + 1). \(cookie.name): \(cookie.value)")
                print("     - Domain: \(cookie.domain)")
                print("     - Path: \(cookie.path)")
                print("     - Secure: \(cookie.isSecure)")
                print("     - HttpOnly: \(cookie.isHTTPOnly)")
                print("     - Expires: \(cookie.expiresDate?.description ?? "Session")")
            }
        }
    }
    
    // Get app and API diagnostic info - removed UIDevice references
    func getDiagnosticInfo() -> String {
        var info = "Diagnostic Information\n"
        info += "=======================\n"
        
        // App info
        let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "Unknown"
        info += "App Version: \(appVersion)\n"
        
        // Network info
        let hasAuthCookies = checkAuthCookies()
        info += "Auth Cookies Present: \(hasAuthCookies ? "Yes" : "No")\n"
        
        // Current user
        if let currentUser = AuthManager.shared.currentUser {
            info += "Logged in as: \(currentUser.username) (ID: \(currentUser.id))\n"
        } else {
            info += "Not logged in\n"
        }
        
        return info
    }
    
    // Diagnostic function to check if the network request can reach the server
    func runDiagnostics() -> AnyPublisher<String, Never> {
        var diagnosticResults = "Network Diagnostics\n"
        diagnosticResults += "=================\n"
        
        return checkServerConnectivity()
            .flatMap { serverReachable -> AnyPublisher<String, Never> in
                diagnosticResults += "Server Reachable: \(serverReachable ? "Yes" : "No")\n"
                
                if !serverReachable {
                    diagnosticResults += "Cannot connect to server. Please check your internet connection and try again.\n"
                    return Just(diagnosticResults).eraseToAnyPublisher()
                }
                
                // Check authentication cookies
                let hasAuthCookies = self.checkAuthCookies()
                diagnosticResults += "Auth Cookies Present: \(hasAuthCookies ? "Yes" : "No")\n"
                
                if !hasAuthCookies && AuthManager.shared.isAuthenticated {
                    diagnosticResults += "Warning: Logged in but no auth cookies found. Session may be invalid.\n"
                }
                
                // Check API health
                return APIService.shared.wakeUpServer()
                    .map { apiHealthy -> String in
                        diagnosticResults += "API Health Check: \(apiHealthy ? "Passed" : "Failed")\n"
                        
                        if !apiHealthy {
                            diagnosticResults += "API is not responding properly. The service might be down or restarting.\n"
                            diagnosticResults += "Recommendation: Wait a few minutes and try again.\n"
                        } else {
                            diagnosticResults += "All systems operational.\n"
                        }
                        
                        return diagnosticResults
                    }
                    .eraseToAnyPublisher()
            }
            .eraseToAnyPublisher()
    }
}
