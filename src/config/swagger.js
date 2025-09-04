const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Swagger definition
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Church Backend API',
    version: '1.0.0',
    description: 'Comprehensive API documentation for Church Management System',
    contact: {
      name: 'Church Development Team',
      email: 'dev@church.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:1098',
      description: 'Development server'
    },
    {
      url: 'https://church-app-0rin.onrender.com',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for authentication'
      },
      biometricAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Biometric-Token',
        description: 'Biometric authentication token'
      }
    },
    schemas: {
      // User Schemas
      User: {
        type: 'object',
        required: ['firstName', 'lastName', 'phoneNumber'],
        properties: {
          _id: {
            type: 'string',
            description: 'User ID'
          },
          firstName: {
            type: 'string',
            description: 'User first name',
            example: 'John'
          },
          lastName: {
            type: 'string',
            description: 'User last name',
            example: 'Doe'
          },
          phoneNumber: {
            type: 'string',
            description: 'User phone number',
            example: '+1234567890'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
            example: 'john.doe@example.com'
          },
          dateOfBirth: {
            type: 'string',
            format: 'date',
            description: 'User date of birth'
          },
          gender: {
            type: 'string',
            enum: ['male', 'female', 'other'],
            description: 'User gender'
          },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zipCode: { type: 'string' },
              country: { type: 'string' }
            }
          },
          isVerified: {
            type: 'boolean',
            description: 'Whether user is verified'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'suspended'],
            description: 'User status'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'User creation timestamp'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'User last update timestamp'
          }
        }
      },
      
      // Admin Schemas
      Admin: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'role'],
        properties: {
          _id: {
            type: 'string',
            description: 'Admin ID'
          },
          firstName: {
            type: 'string',
            description: 'Admin first name',
            example: 'Jane'
          },
          lastName: {
            type: 'string',
            description: 'Admin last name',
            example: 'Smith'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Admin email address',
            example: 'jane.smith@church.com'
          },
          phoneNumber: {
            type: 'string',
            description: 'Admin phone number'
          },
          role: {
            type: 'string',
            enum: ['super_admin', 'system_admin', 'content_admin', 'user_admin'],
            description: 'Admin role'
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Admin permissions'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'suspended', 'pending'],
            description: 'Admin status'
          },
          biometricEnabled: {
            type: 'boolean',
            description: 'Whether biometric authentication is enabled'
          },
          lastLoginAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last login timestamp'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Admin creation timestamp'
          }
        }
      },
      
      // Unit Leader Schemas
      UnitLeader: {
        type: 'object',
        required: ['firstName', 'lastName', 'phoneNumber', 'unitType', 'unitName', 'role'],
        properties: {
          _id: {
            type: 'string',
            description: 'Unit Leader ID'
          },
          firstName: {
            type: 'string',
            description: 'Unit leader first name'
          },
          lastName: {
            type: 'string',
            description: 'Unit leader last name'
          },
          phoneNumber: {
            type: 'string',
            description: 'Unit leader phone number'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Unit leader email'
          },
          unitType: {
            type: 'string',
            enum: ['ward', 'stake', 'branch', 'district', 'mission', 'temple'],
            description: 'Type of church unit'
          },
          unitName: {
            type: 'string',
            description: 'Name of the church unit'
          },
          role: {
            type: 'string',
            description: 'Leadership role in the unit'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending', 'released'],
            description: 'Unit leader status'
          },
          appointmentDate: {
            type: 'string',
            format: 'date',
            description: 'Date of appointment'
          },
          releaseDate: {
            type: 'string',
            format: 'date',
            description: 'Date of release'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Creation timestamp'
          }
        }
      },
      
      // Response Schemas
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          message: {
            type: 'string',
            example: 'Operation completed successfully'
          },
          data: {
            type: 'object',
            description: 'Response data'
          }
        }
      },
      
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          message: {
            type: 'string',
            example: 'An error occurred'
          },
          error: {
            type: 'string',
            description: 'Error details (development only)'
          }
        }
      },
      
      // Authentication Schemas
      LoginRequest: {
        type: 'object',
        required: ['phoneNumber', 'password'],
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'User phone number',
            example: '+1234567890'
          },
          password: {
            type: 'string',
            description: 'User password',
            example: 'password123'
          }
        }
      },
      
      LoginResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          message: {
            type: 'string',
            example: 'Login successful'
          },
          data: {
            type: 'object',
            properties: {
              token: {
                type: 'string',
                description: 'JWT authentication token'
              },
              user: {
                $ref: '#/components/schemas/User'
              }
            }
          }
        }
      },
      
      // Dashboard Schemas
      DashboardOverview: {
        type: 'object',
        properties: {
          overview: {
            type: 'object',
            properties: {
              totalMembers: { type: 'number' },
              activeMembers: { type: 'number' },
              verifiedMembers: { type: 'number' },
              membershipRate: { type: 'string' },
              newMembersToday: { type: 'number' },
              newMembersThisWeek: { type: 'number' },
              newMembersThisMonth: { type: 'number' }
            }
          },
          unitLeaders: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              active: { type: 'number' },
              pending: { type: 'number' },
              activeRate: { type: 'string' }
            }
          },
          admins: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              active: { type: 'number' },
              distribution: {
                type: 'object',
                properties: {
                  super_admin: { type: 'number' },
                  system_admin: { type: 'number' },
                  content_admin: { type: 'number' },
                  user_admin: { type: 'number' }
                }
              }
            }
          },
          quickActions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                icon: { type: 'string' },
                count: { type: 'number' },
                route: { type: 'string' }
              }
            }
          },
          systemHealth: {
            type: 'object',
            properties: {
              database: { type: 'string' },
              server: { type: 'string' },
              uptime: { type: 'number' },
              lastBackup: { type: 'string', format: 'date-time' }
            }
          },
          lastUpdated: {
            type: 'string',
            format: 'date-time'
          }
        }
      }
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ]
};

// Options for the swagger docs
const options = {
  swaggerDefinition,
  // Paths to files containing OpenAPI definitions
  apis: [
    './src/routes/*.js',
    './src/controllers/*.js',
    './src/models/*.js'
  ]
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

module.exports = {
  swaggerSpec,
  swaggerUi
};