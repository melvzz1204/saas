# Dental Clinic SaaS Data Flow Diagram Breakdown

## Scope and Notation

This document provides the Level 1 and Level 2 process breakdown for the Dental
Clinic SaaS System.

- **External entities:** Patient, Clinic Administrator, Clinic Staff / Dentist,
  and SaaS Administrator.
- **Input labels:** Data entering a process from an external entity or data
  store.
- **Output labels:** Data produced by a process and sent to an external entity
  or data store.
- **Data stores:** Internal repositories read or updated by a process.

## Data Store Directory

- **D1 - Clinic Records:** Clinic identity, slug, application status,
  verification documents, operating hours, slot duration, and activation status.
- **D2 - User Accounts:** Patient, clinic administrator, and SaaS administrator
  accounts, credentials, roles, clinic assignments, and account status.
- **D3 - Staff Records:** Dentist and staff profiles, clinic assignments, access
  PINs, roles, availability status, and professional information.
- **D4 - Patient Profiles:** Personal information, dental history, medical
  history, allergies, conditions, and patient certification data.
- **D5 - Appointment Records:** Bookings, walk-ins, assigned dentist, service,
  schedule, queue status, and payment completion status.
- **D6 - Treatment Records:** Treatment session, procedure, treated tooth,
  clinical notes, treatment status, and billing amount.
- **D7 - Clinical Notes:** Complaint, assessment, treatment rendered, progress
  notes, recommendations, and next visit date.
- **D8 - Dental Services:** Service name, description, base price, availability,
  and update information.

# Level 1 Processes

## 1.0 Manage Tenant Applications

- **Inputs:** Clinic registration details; administrator account details;
  verification documents; approval, rejection, activation, or suspension
  decision.
- **Outputs:** Registration confirmation; clinic application status; tenant
  directory; platform clinic statistics.
- **Reads:** D1 Clinic Records; D2 User Accounts; D5 Appointment Records.
- **Writes:** D1 Clinic Records; D2 User Accounts.

## 2.0 Authenticate Users

- **Inputs:** Email and password; email and staff PIN; tenant identifier;
  authentication token.
- **Outputs:** Authentication result; session token; user identity; role; clinic
  context; access-denied message.
- **Reads:** D1 Clinic Records; D2 User Accounts; D3 Staff Records.
- **Writes:** None.

## 3.0 Manage Patient Records

- **Inputs:** Patient registration details; personal information; dental
  history; medical history; allergies; health conditions; certification data;
  profile retrieval request.
- **Outputs:** Patient account confirmation; patient profile; prefilled profile;
  profile update confirmation; validation error.
- **Reads:** D2 User Accounts; D4 Patient Profiles.
- **Writes:** D2 User Accounts; D4 Patient Profiles.

## 4.0 Manage Appointments

- **Inputs:** Preferred service, dentist, date, and time; appointment approval
  or rejection; walk-in details; dentist assignment; queue status update.
- **Outputs:** Available time slots; booking confirmation; appointment status;
  appointment list; assigned patient queue; live status notification.
- **Reads:** D1 Clinic Records; D3 Staff Records; D5 Appointment Records; D8
  Dental Services.
- **Writes:** D5 Appointment Records; D6 Treatment Records when treatment
  begins.

## 5.0 Manage Treatments and Clinical Notes

- **Inputs:** Assigned-patient request; procedure details; treated tooth;
  clinical observations; complaint; assessment; treatment rendered;
  recommendations; treatment-completion request.
- **Outputs:** Dentist treatment queue; treatment status; saved clinical note;
  patient clinical history; completed treatment for billing.
- **Reads:** D4 Patient Profiles; D5 Appointment Records; D6 Treatment Records;
  D7 Clinical Notes; D8 Dental Services.
- **Writes:** D5 Appointment Records; D6 Treatment Records; D7 Clinical Notes.

## 6.0 Manage Pricing and Billing

- **Inputs:** New service details; service price update; service availability
  update; final charge; payment confirmation.
- **Outputs:** Service catalogue; updated service information; calculated bill;
  payment result; receipt information; completed appointment status.
- **Reads:** D5 Appointment Records; D6 Treatment Records; D8 Dental Services.
- **Writes:** D5 Appointment Records; D6 Treatment Records; D8 Dental Services.

# Level 2 Processes

## Level 2 for 1.0 Manage Tenant Applications

### 1.1 Receive Clinic Registration

- **Input labels:** Clinic name; clinic slug; administrator first name;
  administrator last name; email; phone; password.
- **Output labels:** Validated clinic application; registration validation
  error.
- **Data stores:** Reads D1 Clinic Records and D2 User Accounts to detect
  duplicate slugs and email addresses.

### 1.2 Create Clinic Record

- **Input labels:** Validated clinic name and slug.
- **Output labels:** New clinic identifier; clinic creation confirmation.
- **Data stores:** Writes D1 Clinic Records.

### 1.3 Create Clinic Administrator Account

- **Input labels:** Clinic identifier; administrator details; password.
- **Output labels:** Clinic administrator account; account creation
  confirmation.
- **Data stores:** Writes D2 User Accounts; deletes the related D1 Clinic Record
  if administrator creation fails.

### 1.4 Receive Verification Documents

- **Input labels:** Clinic identifier; document files; document names.
- **Output labels:** Document URLs; upload confirmation; upload error.
- **Data stores:** Reads and updates D1 Clinic Records.

### 1.5 Retrieve Pending Applications

- **Input labels:** Pending-application request; SaaS administrator session.
- **Output labels:** Pending clinic applications and document references.
- **Data stores:** Reads D1 Clinic Records.

### 1.6 Review Clinic Application

- **Input labels:** Clinic identifier; approval or rejection decision; rejection
  reason.
- **Output labels:** Reviewed application; application decision notification.
- **Data stores:** Reads and updates D1 Clinic Records; reads D2 User Accounts
  for the clinic administrator contact.

### 1.7 Activate or Suspend Clinic

- **Input labels:** Clinic identifier; desired activation status.
- **Output labels:** Updated clinic status; status-change confirmation.
- **Data stores:** Reads and updates D1 Clinic Records.

### 1.8 Generate Platform Statistics

- **Input labels:** Dashboard statistics request; SaaS administrator session.
- **Output labels:** Total clinics; active clinics; total patients; total
  appointments; tenant directory.
- **Data stores:** Reads D1 Clinic Records, D2 User Accounts, and D5 Appointment
  Records.

## Level 2 for 2.0 Authenticate Users

### 2.1 Receive Login Credentials

- **Input labels:** Email and password, or email and staff PIN; optional tenant
  identifier.
- **Output labels:** Normalized credentials; missing-credential error.
- **Data stores:** None.

### 2.2 Identify User Type

- **Input labels:** Login portal; submitted credentials.
- **Output labels:** Patient, clinic administrator, staff, dentist, or SaaS
  administrator authentication path.
- **Data stores:** None.

### 2.3 Retrieve User Account

- **Input labels:** Normalized email; selected authentication path.
- **Output labels:** User account or account-not-found result.
- **Data stores:** Reads D2 User Accounts for patients and administrators; reads
  D3 Staff Records for clinical staff.

### 2.4 Verify Password or Staff PIN

- **Input labels:** Submitted password or PIN; stored credential.
- **Output labels:** Credential verification result.
- **Data stores:** Uses credential data read from D2 User Accounts or D3 Staff
  Records.

### 2.5 Validate User Role and Status

- **Input labels:** User role; account status; requested portal.
- **Output labels:** Authorized role or access-denied result.
- **Data stores:** Reads status and role data from D2 User Accounts or D3 Staff
  Records.

### 2.6 Validate Clinic Context

- **Input labels:** Account clinic identifier; requested clinic identifier;
  clinic activation status.
- **Output labels:** Verified clinic context or tenant-mismatch result.
- **Data stores:** Reads D1 Clinic Records and account clinic assignment from D2
  User Accounts or D3 Staff Records.

### 2.7 Generate Session Token

- **Input labels:** Verified user identifier; role; clinic identifier.
- **Output labels:** Signed session token and expiration information.
- **Data stores:** None.

### 2.8 Return Authentication Result

- **Input labels:** Session token; sanitized user or staff details;
  authentication result.
- **Output labels:** Login success response or authentication error response.
- **Data stores:** None.

## Level 2 for 3.0 Manage Patient Records

### 3.1 Register Patient Account

- **Input labels:** Clinic identifier; first name; last name; email; phone;
  password.
- **Output labels:** New patient account; registration confirmation;
  duplicate-account error.
- **Data stores:** Reads and writes D2 User Accounts.

### 3.2 Retrieve Basic Patient Information

- **Input labels:** Authenticated patient identifier; clinic identifier.
- **Output labels:** First name; last name; email; phone; birth date; prefilled
  intake information.
- **Data stores:** Reads D2 User Accounts.

### 3.3 Retrieve Patient Intake Profile

- **Input labels:** Authenticated patient identifier; clinic identifier.
- **Output labels:** Existing intake profile or new-form indicator.
- **Data stores:** Reads D4 Patient Profiles.

### 3.4 Record Personal Information

- **Input labels:** Name; birth date; sex; contact information; address;
  occupation; insurance; consultation reason.
- **Output labels:** Validated personal-information section.
- **Data stores:** Written to D4 Patient Profiles through Process 3.7.

### 3.5 Record Dental History

- **Input labels:** Previous dentist; last dental visit; dental concerns.
- **Output labels:** Validated dental-history section.
- **Data stores:** Written to D4 Patient Profiles through Process 3.7.

### 3.6 Record Medical History

- **Input labels:** Physician information; medication; hospitalization;
  allergies; health conditions; vital information.
- **Output labels:** Validated medical-history section.
- **Data stores:** Written to D4 Patient Profiles through Process 3.7.

### 3.7 Save or Update Patient Profile

- **Input labels:** Patient identifier; clinic identifier; validated personal,
  dental, medical, and certification information.
- **Output labels:** Saved patient profile; profile update confirmation;
  validation error.
- **Data stores:** Reads and writes D4 Patient Profiles.

### 3.8 Return Patient Profile

- **Input labels:** Existing, prefilled, or newly saved patient profile.
- **Output labels:** Patient profile display data and form state.
- **Data stores:** Uses data read from D2 User Accounts and D4 Patient Profiles.

## Level 2 for 4.0 Manage Appointments

### 4.1 Retrieve Clinic Schedule

- **Input labels:** Clinic identifier; requested appointment date.
- **Output labels:** Operating hours; closed-day status; appointment slot
  duration.
- **Data stores:** Reads D1 Clinic Records.

### 4.2 Check Available Time Slots

- **Input labels:** Appointment date; clinic identifier; optional dentist
  identifier; clinic schedule.
- **Output labels:** Generated time slots; booked time slots; closure message.
- **Data stores:** Reads D5 Appointment Records and schedule data from D1 Clinic
  Records.

### 4.3 Receive Appointment Request

- **Input labels:** Patient identifier; clinic identifier; service; dentist;
  date; time.
- **Output labels:** Validated booking request or booking validation error.
- **Data stores:** May read D3 Staff Records and D8 Dental Services to support
  dentist and service selection.

### 4.4 Record Pending Appointment

- **Input labels:** Validated booking request.
- **Output labels:** Pending appointment; booking confirmation; live pipeline
  update.
- **Data stores:** Writes D5 Appointment Records.

### 4.5 Approve or Reject Appointment

- **Input labels:** Appointment identifier; approval, rejection, cancellation,
  or missed status.
- **Output labels:** Updated appointment; status notification.
- **Data stores:** Reads and updates D5 Appointment Records.

### 4.6 Record Walk-In Patient

- **Input labels:** Patient name; clinic identifier; treatment name; optional
  dentist identifier.
- **Output labels:** Checked-in walk-in appointment; queue notification.
- **Data stores:** Writes D5 Appointment Records.

### 4.7 Assign Dentist

- **Input labels:** Appointment identifier; dentist identifier.
- **Output labels:** Assigned appointment; dentist assignment confirmation.
- **Data stores:** Reads D3 Staff Records and updates D5 Appointment Records.

### 4.8 Update Patient Queue Status

- **Input labels:** Appointment identifier; checked-in, in-treatment, completed,
  or cancelled status.
- **Output labels:** Updated queue item; staff-board update; patient status
  update; treatment-start information.
- **Data stores:** Reads and updates D5 Appointment Records; creates or updates
  D6 Treatment Records when status becomes in-treatment.

### 4.9 Send Appointment Status

- **Input labels:** Updated appointment status; dentist name; appointment
  identifier.
- **Output labels:** Patient live-status notification; clinic appointment-board
  update; staff queue update.
- **Data stores:** Uses current data from D5 Appointment Records.

## Level 2 for 5.0 Manage Treatments and Clinical Notes

### 5.1 Retrieve Assigned Patient Queue

- **Input labels:** Authenticated dentist identifier; clinic identifier;
  active-queue request.
- **Output labels:** In-chair treatment sessions and patient details.
- **Data stores:** Reads D6 Treatment Records and related D5 Appointment
  Records.

### 5.2 Start Treatment Session

- **Input labels:** In-treatment appointment; clinic identifier; dentist
  identifier; patient name; procedure name.
- **Output labels:** Active treatment session with IN_CHAIR status.
- **Data stores:** Reads D5 Appointment Records and writes D6 Treatment Records.

### 5.3 Retrieve Patient Medical and Dental History

- **Input labels:** Patient identifier; clinic identifier; authenticated
  clinical-user request.
- **Output labels:** Patient intake profile and previous clinical history.
- **Data stores:** Reads D4 Patient Profiles and D7 Clinical Notes.

### 5.4 Record Procedure Details

- **Input labels:** Treatment identifier; procedure name; clinical observations;
  treatment rendered.
- **Output labels:** Validated procedure information.
- **Data stores:** Written to D6 Treatment Records and D7 Clinical Notes through
  later processes.

### 5.5 Record Treated Teeth

- **Input labels:** Treatment identifier; treated tooth or treated-teeth list.
- **Output labels:** Validated tooth information.
- **Data stores:** Written to D6 Treatment Records or D7 Clinical Notes.

### 5.6 Record Clinical Assessment

- **Input labels:** Patient identifier; appointment identifier; chief complaint;
  assessment; progress notes; recommendations; next visit date.
- **Output labels:** Validated clinical assessment.
- **Data stores:** Prepared for D7 Clinical Notes.

### 5.7 Save Clinical Note

- **Input labels:** Clinic identifier; patient identifier; dentist identifier;
  appointment identifier; validated clinical assessment and treatment details.
- **Output labels:** Saved clinical note; note confirmation; patient clinical
  history.
- **Data stores:** Writes D7 Clinical Notes and reads related data from D5
  Appointment Records.

### 5.8 Complete Treatment Session

- **Input labels:** Treatment identifier; treated tooth; clinical notes;
  optional billing amount.
- **Output labels:** Completed-pending-bill treatment; updated appointment
  status; live patient notification.
- **Data stores:** Reads and updates D6 Treatment Records; updates D5
  Appointment Records; reads D8 Dental Services when a billing amount is not
  supplied.

### 5.9 Send Patient to Billing Queue

- **Input labels:** Completed treatment identifier; appointment identifier;
  billing amount.
- **Output labels:** Billing-queue item; completion notification for staff and
  patient.
- **Data stores:** Reads D6 Treatment Records and updates D5 Appointment
  Records.

## Level 2 for 6.0 Manage Pricing and Billing

### 6.1 Retrieve Dental Services

- **Input labels:** Service-catalogue request.
- **Output labels:** Service name; description; base price; availability.
- **Data stores:** Reads D8 Dental Services.

### 6.2 Add Dental Service

- **Input labels:** Service slug; name; description; base price; availability;
  administrator identifier.
- **Output labels:** New service record; creation confirmation;
  duplicate-service error.
- **Data stores:** Reads and writes D8 Dental Services.

### 6.3 Update Service Price

- **Input labels:** Service slug; new price; administrator identifier.
- **Output labels:** Updated service price; update confirmation; validation
  error.
- **Data stores:** Reads and updates D8 Dental Services.

### 6.4 Update Service Availability

- **Input labels:** Service identifier; availability status.
- **Output labels:** Updated service availability; update confirmation.
- **Data stores:** Reads and updates D8 Dental Services.

### 6.5 Retrieve Completed Treatment

- **Input labels:** Appointment identifier; payment-settlement request.
- **Output labels:** Treatment billing amount; procedure name; appointment
  service.
- **Data stores:** Reads D5 Appointment Records and D6 Treatment Records.

### 6.6 Determine Final Billing Amount

- **Input labels:** Submitted final amount; treatment billing amount;
  appointment service; service base price.
- **Output labels:** Calculated final billing amount.
- **Data stores:** Reads D6 Treatment Records and D8 Dental Services.

### 6.7 Record Payment Settlement

- **Input labels:** Appointment identifier; calculated final billing amount;
  payment confirmation.
- **Output labels:** Settled treatment; completed appointment; settlement
  confirmation.
- **Data stores:** Updates D5 Appointment Records and D6 Treatment Records.

### 6.8 Close Treatment and Appointment

- **Input labels:** Successful settlement result.
- **Output labels:** DONE treatment status; completed appointment status; live
  board and patient update.
- **Data stores:** Writes final status to D5 Appointment Records and D6
  Treatment Records.

### 6.9 Return Payment Result

- **Input labels:** Completed appointment; settled treatment; final billing
  amount.
- **Output labels:** Payment-success response; receipt information; patient
  notification; staff-board notification.
- **Data stores:** Uses final data from D5 Appointment Records and D6 Treatment
  Records.

## DFD Flow Rules Applied

- External entities exchange data only with processes.
- Data stores exchange data only with processes.
- Every process has at least one input and one output.
- Input and output labels name data rather than commands.
- Level 2 processes preserve the scope, inputs, and outputs of their
  corresponding Level 1 process.
