require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const biometricRoutes = require('./routes/biometric');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
const userManagementRoutes = require('./routes/userManagement');
const systemSettingsRoutes = require('./routes/systemSettings');
const auditLogRoutes = require('./routes/auditLog');
const unitLeaderRoutes = require('./routes/unitLeader');
const unitAssignmentRoutes = require('./routes/unitAssignment');
const { swaggerSpec, swaggerUi } = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Church API Documentation',
  customfavIcon: '/favicon.ico',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true
  }
}));

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Church Backend API is running',
    timestamp: new Date().toISOString(),
    documentation: '/api-docs'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin/users', userManagementRoutes);
app.use('/api/settings', systemSettingsRoutes);
app.use('/api/audit', auditLogRoutes);
app.use('/api/unit-leaders', unitLeaderRoutes);
app.use('/api/unit-assignments', unitAssignmentRoutes);

app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found' 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📱 Church Backend API ready for mobile app`);
});

module.exports = app;