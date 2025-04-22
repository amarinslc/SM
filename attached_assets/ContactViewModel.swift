//
//  ContactViewModel.swift
//  db
//
//  Created by Amarins Laanstra-Corn on 4/21/25.
//

import Foundation
import Combine
import SwiftUI

class ContactViewModel: ObservableObject {
    @Published var contactUsers: [SimpleUser] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var contactsPermissionGranted = false
    
    private var cancellables = Set<AnyCancellable>()
    
    func loadContactUsers() {
        isLoading = true
        error = nil
        
        // First fetch the device contacts
        ContactAPI.shared.fetchContacts { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let contactsData):
                let (phoneNumbers, emails) = contactsData
                
                // Check if we have any contacts to search
                if phoneNumbers.isEmpty && emails.isEmpty {
                    self.isLoading = false
                    self.error = "No contacts found on your device."
                    return
                }
                
                self.contactsPermissionGranted = true
                
                // Now search for users matching these contacts
                self.searchContactUsers(phoneNumbers: phoneNumbers, emails: emails)
                
            case .failure(let error):
                self.isLoading = false
                if let contactError = error as? ContactError, contactError == .permissionDenied {
                    self.contactsPermissionGranted = false
                }
                self.error = error.localizedDescription
            }
        }
    }
    
    private func searchContactUsers(phoneNumbers: [String], emails: [String]) {
        // Only search with non-empty arrays to satisfy API requirements
        let phonesToSend = !phoneNumbers.isEmpty ? phoneNumbers : []
        let emailsToSend = !emails.isEmpty ? emails : []
        
        if phonesToSend.isEmpty && emailsToSend.isEmpty {
            isLoading = false
            error = "No contact data available to search."
            return
        }
        
        ContactAPI.shared.searchContactUsers(phoneNumbers: phonesToSend, emails: emailsToSend)
            .receive(on: DispatchQueue.main)
            .sink { completion in
                self.isLoading = false
                if case let .failure(err) = completion {
                    self.error = err.localizedDescription
                }
            } receiveValue: { users in
                self.contactUsers = users
            }
            .store(in: &cancellables)
    }
}
