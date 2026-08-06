export interface SecurityControl {
  control: string;
  description: string;
}

export interface SecurityContent {
  hero: {
    title: string;
    description: string;
    primaryCta: {
      label: string;
      href: string;
    };
    secondaryCta: {
      label: string;
      href: string;
    };
  };
  sections: {
    tenantIsolation: {
      title: string;
      content: string[];
    };
    rolesPermissions: {
      title: string;
      content: string[];
    };
    auditability: {
      title: string;
      content: string[];
    };
    dataRetention: {
      title: string;
      content: string[];
    };
    mediaHandling: {
      title: string;
      content: string[];
    };
    securityControls: {
      title: string;
      controls: SecurityControl[];
    };
    dataLocations: {
      title: string;
      content: string[];
    };
    safeguarding: {
      title: string;
      content: string[];
    };
  };
  lastUpdated: string;
}

export const securityContent: SecurityContent = {
  hero: {
    title: "Security, Safeguarding & Compliance at Nexsteps",
    description:
      "Nexsteps is a connected operations system with security and compliance built in. We protect children's data, support safeguarding workflows, and help organisations operate with stronger accountability.",
    primaryCta: {
      label: "Book a security walkthrough",
      href: "/demo?topic=security",
    },
    secondaryCta: {
      label: "Download security overview (PDF)",
      href: "#", // TODO: Add PDF download when available
    },
  },
  sections: {
    tenantIsolation: {
      title: "Tenant Isolation & Multi-Tenant Architecture",
      content: [
        "Nexsteps uses a multi-tenant architecture where each organisation operates independently. Each organisation can have multiple Sites (e.g., different school locations or programme groups), and each Site is a separate tenant boundary.",
        "Staff members only see data for the Sites they are assigned to. Data is isolated at the database level using Row-Level Security (RLS) policies, ensuring that even if there were a bug in application code, users cannot access data from other organisations or Sites.",
        "Organisation administrators have broader access across their Sites but all access is logged and auditable. Site-level administrators can manage their specific Site's data, staff, and settings.",
      ],
    },
    rolesPermissions: {
      title: "Roles & Permissions",
      content: [
        "Nexsteps implements Role-Based Access Control (RBAC) to ensure staff only have access to the information they need for their role.",
        "Key roles include:",
        "• Organisation Administrators: Manage organisation-wide settings, billing, and can view reports across all Sites",
        "• Site Administrators: Manage staff, children, schedules, and settings for their specific Site",
        "• Staff/Teachers: Can view and manage attendance, schedules, and create notes for children in their assigned groups",
        "• Safeguarding Leads: Have additional permissions to view and manage safeguarding concerns and sensitive notes",
        "All role assignments are logged, and permissions are enforced at both the application and database levels.",
      ],
    },
    auditability: {
      title: "Auditability & Logging",
      content: [
        "Nexsteps maintains comprehensive audit logs for important actions, including:",
        "• Attendance changes and corrections",
        "• Safeguarding note creation, updates, and access",
        "• Staff assignments and role changes",
        "• Child profile views and updates",
        "• Schedule and rota modifications",
        "All audit events include the user who performed the action, a timestamp, and relevant context. These logs are used for accountability, safeguarding reviews, and compliance purposes-not for marketing or analytics.",
        "Audit logs are retained according to your organisation's retention policy and can be exported for review or compliance reporting.",
      ],
    },
    dataRetention: {
      title: "Data Retention & Data Subject Access Requests (DSAR)",
      content: [
        "Nexsteps supports configurable retention policies for core data types, including:",
        "• Attendance records",
        "• Staff activity logs",
        "• Audit events",
        "• Safeguarding records",
        "Organisations can configure retention windows that align with their policies and legal requirements. Data that exceeds the retention period can be automatically archived or anonymised.",
        "Nexsteps provides tools to support Data Subject Access Requests (DSARs). Organisations can export relevant information for a specific child or individual through the admin interface. This export includes all data associated with that person, formatted for review and sharing as needed.",
      ],
    },
    mediaHandling: {
      title: "Media & File Handling",
      content: [
        "When Nexsteps handles media files (such as photos, documents, or lesson resources), they are stored securely and accessed via signed, expiring URLs.",
        "Access to files is checked against user permissions in the application before a signed URL is generated. This means:",
        "• Files are not directly accessible via public URLs",
        "• Each access request is validated against the user's role and Site membership",
        "• Signed URLs expire after a short time window, preventing unauthorised sharing",
        "Parents and staff access media through the Nexsteps UI, which ensures proper access control and auditability. Raw file URLs are not meant to be shared outside the platform.",
      ],
    },
    securityControls: {
      title: "Security Controls Summary",
      controls: [
        {
          control: "Authentication",
          description:
            "Nexsteps uses Clerk for authentication, supporting SSO and multi-factor authentication (MFA). All authentication flows use industry-standard protocols (OAuth 2.0, OpenID Connect).",
        },
        {
          control: "Authorisation",
          description:
            "Role-Based Access Control (RBAC) is enforced at both the application and database levels. Users are assigned roles per Site, and permissions are checked on every request.",
        },
        {
          control: "Data Isolation",
          description:
            "Multi-tenant data isolation is enforced using Row-Level Security (RLS) at the database level. Each Site is a separate tenant boundary, and users can only access data for Sites they are assigned to.",
        },
        {
          control: "Encryption in Transit",
          description:
            "All data transmitted between clients and Nexsteps servers is encrypted using HTTPS/TLS 1.2 or higher. This includes web traffic, API requests, and mobile app communications.",
        },
        {
          control: "Encryption at Rest",
          description:
            "Data stored in our databases and file storage systems is encrypted at rest using encryption managed by our cloud provider. Encryption keys are managed securely and rotated regularly.",
        },
        {
          control: "Backups & Disaster Recovery",
          description:
            "Nexsteps performs regular automated backups of all production data. Backups are retained according to our retention policy and are tested regularly to ensure they can be restored. Disaster recovery procedures are documented and tested.",
        },
        {
          control: "Logging & Monitoring",
          description:
            "Nexsteps maintains aggregated logs of system events, errors, and security-relevant actions. Critical errors and security events trigger alerts to our operations team. Logs are retained for troubleshooting and security analysis.",
        },
      ],
    },
    dataLocations: {
      title: "Data Locations",
      content: [
        "Nexsteps production infrastructure is hosted with reputable cloud providers. Our primary hosting regions are designed to serve UK and EU customers, with data residency aligned to support GDPR and UK data protection requirements.",
        "As we expand our service, we will keep this page updated with specific region information. If your organisation has specific data residency requirements, please contact us to discuss how we can meet your needs.",
      ],
    },
    safeguarding: {
      title: "Safeguarding & Least Privilege",
      content: [
        "Nexsteps is designed to support your organisation's safeguarding policies and procedures, not replace them. The platform provides tools to help staff record and manage safeguarding information securely.",
        "Safeguarding features include:",
        "• Strict access controls: Only designated staff with safeguarding roles can view and manage safeguarding concerns and sensitive notes",
        "• Audit trails: All access to safeguarding information is logged, including who viewed what and when",
        "• Role-based visibility: Organisation administrators can see configuration and reports but may not have direct access to raw safeguarding details, depending on their role and your organisation's policies",
        "• Parent visibility controls: Schools can configure whether parents can see positive notes, and all safeguarding concerns are never visible to parents",
        "Nexsteps follows the principle of least privilege: users only have access to the minimum information necessary for their role. This reduces the risk of unauthorised access and helps maintain confidentiality.",
      ],
    },
  },
  lastUpdated: "December 2024",
};
