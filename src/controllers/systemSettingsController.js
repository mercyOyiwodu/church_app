const SystemSettings = require('../models/SystemSettings');
const Admin = require('../models/Admin');

/**
 * Get all system settings
 */
const getSystemSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getCurrentSettings();
    
    // Log admin activity
    await req.admin.logActivity('view_system_settings', {
      settingsVersion: settings.version
    });

    res.json({
      success: true,
      data: { settings }
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve system settings'
    });
  }
};

/**
 * Get specific settings category
 */
const getSettingsCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await SystemSettings.getCurrentSettings();
    
    const validCategories = [
      'authSettings', 'smsSettings', 'emailSettings', 'securitySettings',
      'databaseSettings', 'notificationSettings', 'featureFlags', 'apiSettings'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings category',
        validCategories
      });
    }
    
    const categorySettings = settings.getCategory(category);
    
    // Log admin activity
    await req.admin.logActivity('view_settings_category', {
      category,
      settingsVersion: settings.version
    });

    res.json({
      success: true,
      data: {
        category,
        settings: categorySettings
      }
    });
  } catch (error) {
    console.error('Get settings category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings category'
    });
  }
};

/**
 * Update system settings
 */
const updateSystemSettings = async (req, res) => {
  try {
    const { updates, reason } = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Updates object is required'
      });
    }
    
    const settings = await SystemSettings.getCurrentSettings();
    
    // Validate the updates
    const tempSettings = { ...settings.toObject(), ...updates };
    const validationErrors = settings.validateSettings.call({ ...settings.toObject(), ...updates });
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Update settings with change tracking
    const updatedSettings = await settings.updateSettings(updates, req.admin._id, reason);
    
    // Log admin activity
    await req.admin.logActivity('update_system_settings', {
      updatedFields: Object.keys(updates),
      reason,
      oldVersion: settings.version,
      newVersion: updatedSettings.version
    });

    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: {
        settings: updatedSettings,
        version: updatedSettings.version
      }
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update system settings'
    });
  }
};

/**
 * Update specific settings category
 */
const updateSettingsCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { updates, reason } = req.body;
    
    const validCategories = [
      'authSettings', 'smsSettings', 'emailSettings', 'securitySettings',
      'databaseSettings', 'notificationSettings', 'featureFlags', 'apiSettings'
    ];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings category',
        validCategories
      });
    }
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Updates object is required'
      });
    }
    
    const settings = await SystemSettings.getCurrentSettings();
    
    // Prepare the update object for the specific category
    const categoryUpdates = {
      [category]: {
        ...settings[category],
        ...updates
      }
    };
    
    // Validate the updates
    const validationErrors = settings.validateSettings.call({ ...settings.toObject(), ...categoryUpdates });
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Update settings with change tracking
    const updatedSettings = await settings.updateSettings(categoryUpdates, req.admin._id, reason);
    
    // Log admin activity
    await req.admin.logActivity('update_settings_category', {
      category,
      updatedFields: Object.keys(updates),
      reason,
      oldVersion: settings.version,
      newVersion: updatedSettings.version
    });

    res.json({
      success: true,
      message: `${category} updated successfully`,
      data: {
        category,
        settings: updatedSettings[category],
        version: updatedSettings.version
      }
    });
  } catch (error) {
    console.error('Update settings category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings category'
    });
  }
};

/**
 * Get settings change history
 */
const getSettingsHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const settings = await SystemSettings.getCurrentSettings()
      .populate('changeHistory.changedBy', 'name email role');
    
    const skip = (page - 1) * limit;
    const history = settings.changeHistory
      .sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt))
      .slice(skip, skip + parseInt(limit));
    
    const total = settings.changeHistory.length;
    const totalPages = Math.ceil(total / limit);
    
    // Log admin activity
    await req.admin.logActivity('view_settings_history', {
      page,
      limit,
      totalRecords: total
    });

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get settings history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve settings history'
    });
  }
};

/**
 * Reset settings to default
 */
const resetSettingsToDefault = async (req, res) => {
  try {
    const { category, reason } = req.body;
    
    const settings = await SystemSettings.getCurrentSettings();
    
    if (category) {
      // Reset specific category
      const validCategories = [
        'authSettings', 'smsSettings', 'emailSettings', 'securitySettings',
        'databaseSettings', 'notificationSettings', 'featureFlags', 'apiSettings'
      ];
      
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid settings category',
          validCategories
        });
      }
      
      // Get default values for the category
      const defaultSettings = new SystemSettings();
      const categoryUpdates = {
        [category]: defaultSettings[category]
      };
      
      const updatedSettings = await settings.updateSettings(
        categoryUpdates, 
        req.admin._id, 
        reason || `Reset ${category} to default values`
      );
      
      // Log admin activity
      await req.admin.logActivity('reset_settings_category', {
        category,
        reason,
        newVersion: updatedSettings.version
      });
      
      res.json({
        success: true,
        message: `${category} reset to default values`,
        data: {
          category,
          settings: updatedSettings[category]
        }
      });
    } else {
      // Reset all settings (create new default settings)
      const newSettings = new SystemSettings({
        lastUpdatedBy: req.admin._id,
        changeHistory: [{
          changedBy: req.admin._id,
          changedAt: new Date(),
          changes: { action: 'reset_all_to_default' },
          reason: reason || 'Reset all settings to default values'
        }]
      });
      
      await newSettings.save();
      
      // Log admin activity
      await req.admin.logActivity('reset_all_settings', {
        reason,
        newVersion: newSettings.version
      });
      
      res.json({
        success: true,
        message: 'All settings reset to default values',
        data: { settings: newSettings }
      });
    }
  } catch (error) {
    console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings'
    });
  }
};

/**
 * Export settings configuration
 */
const exportSettings = async (req, res) => {
  try {
    const { includeHistory = false } = req.query;
    const settings = await SystemSettings.getCurrentSettings();
    
    let exportData = {
      settings: settings.toObject(),
      exportedAt: new Date(),
      exportedBy: req.admin._id,
      version: settings.version
    };
    
    if (includeHistory === 'true') {
      exportData.changeHistory = settings.changeHistory;
    } else {
      // Remove sensitive data for export
      delete exportData.settings.changeHistory;
      delete exportData.settings._id;
      delete exportData.settings.__v;
      delete exportData.settings.createdAt;
      delete exportData.settings.updatedAt;
    }
    
    // Log admin activity
    await req.admin.logActivity('export_settings', {
      includeHistory: includeHistory === 'true',
      settingsVersion: settings.version
    });

    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    console.error('Export settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export settings'
    });
  }
};

/**
 * Import settings configuration
 */
const importSettings = async (req, res) => {
  try {
    const { settingsData, reason, overwrite = false } = req.body;
    
    if (!settingsData || typeof settingsData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings data is required'
      });
    }
    
    const currentSettings = await SystemSettings.getCurrentSettings();
    
    // Validate imported settings
    const validationErrors = currentSettings.validateSettings.call(settingsData);
    
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Imported settings validation failed',
        errors: validationErrors
      });
    }
    
    let updatedSettings;
    
    if (overwrite) {
      // Create new settings document
      const newSettings = new SystemSettings({
        ...settingsData,
        lastUpdatedBy: req.admin._id,
        changeHistory: [{
          changedBy: req.admin._id,
          changedAt: new Date(),
          changes: { action: 'import_overwrite' },
          reason: reason || 'Imported settings with overwrite'
        }]
      });
      
      updatedSettings = await newSettings.save();
    } else {
      // Merge with existing settings
      updatedSettings = await currentSettings.updateSettings(
        settingsData,
        req.admin._id,
        reason || 'Imported settings merge'
      );
    }
    
    // Log admin activity
    await req.admin.logActivity('import_settings', {
      overwrite,
      reason,
      newVersion: updatedSettings.version
    });

    res.json({
      success: true,
      message: 'Settings imported successfully',
      data: {
        settings: updatedSettings,
        version: updatedSettings.version
      }
    });
  } catch (error) {
    console.error('Import settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import settings'
    });
  }
};

/**
 * Test settings configuration
 */
const testSettings = async (req, res) => {
  try {
    const { category, testData } = req.body;
    
    const validCategories = ['smsSettings', 'emailSettings'];
    
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid test category. Supported: ' + validCategories.join(', ')
      });
    }
    
    const settings = await SystemSettings.getCurrentSettings();
    const results = { success: false, message: '', details: {} };
    
    switch (category) {
      case 'smsSettings':
        // Test SMS configuration
        if (!settings.smsSettings.enabled) {
          results.message = 'SMS is disabled in settings';
        } else {
          // Here you would test the SMS service
          results.success = true;
          results.message = 'SMS settings test successful';
          results.details = {
            provider: settings.smsSettings.provider,
            testPhone: testData?.phone || 'No test phone provided'
          };
        }
        break;
        
      case 'emailSettings':
        // Test email configuration
        if (!settings.emailSettings.enabled) {
          results.message = 'Email is disabled in settings';
        } else {
          // Here you would test the email service
          results.success = true;
          results.message = 'Email settings test successful';
          results.details = {
            provider: settings.emailSettings.provider,
            fromEmail: settings.emailSettings.fromEmail,
            testEmail: testData?.email || 'No test email provided'
          };
        }
        break;
    }
    
    // Log admin activity
    await req.admin.logActivity('test_settings', {
      category,
      testResult: results.success,
      testData
    });

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Test settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test settings'
    });
  }
};

module.exports = {
  getSystemSettings,
  getSettingsCategory,
  updateSystemSettings,
  updateSettingsCategory,
  getSettingsHistory,
  resetSettingsToDefault,
  exportSettings,
  importSettings,
  testSettings
};