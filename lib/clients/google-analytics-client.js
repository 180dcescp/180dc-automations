#!/usr/bin/env node

/**
 * Google Analytics Client
 * 
 * This client fetches website analytics data from Google Analytics 4
 * and formats it for Slack notifications.
 * 
 * @author 180DC ESCP Development Team
 * @version 1.0.0
 * @since 2024-01-01
 */

import { BetaAnalyticsDataClient } from '@google-analytics/data';
import dotenv from 'dotenv';

dotenv.config();

/**
 * GoogleAnalyticsClient class handles fetching analytics data
 */
class GoogleAnalyticsClient {
  constructor() {
    this.client = new BetaAnalyticsDataClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        project_id: process.env.GOOGLE_PROJECT_ID
      }
    });
    
    // You'll need to set this to your GA4 Property ID
    this.propertyId = process.env.GOOGLE_ANALYTICS_ID || 'G-XXXXXXXXXX';
    this.isEnabled = !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_PROJECT_ID);
    
    if (!this.isEnabled) {
      console.warn('⚠️ Google Analytics disabled - missing credentials');
    }
  }

  /**
   * Get date range for the past week
   */
  getDateRange() {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    
    return {
      currentWeek: {
        startDate: oneWeekAgo.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0]
      },
      previousWeek: {
        startDate: twoWeeksAgo.toISOString().split('T')[0],
        endDate: oneWeekAgo.toISOString().split('T')[0]
      }
    };
  }

  /**
   * Fetch basic metrics for a date range
   */
  async getBasicMetrics(startDate, endDate) {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{
          startDate,
          endDate
        }],
        metrics: [
          { name: 'sessions' },
          { name: 'totalUsers' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' }
        ]
      });

      const metrics = response.rows?.[0]?.metricValues || [];
      
      return {
        sessions: parseInt(metrics[0]?.value || '0'),
        totalUsers: parseInt(metrics[1]?.value || '0'),
        screenPageViews: parseInt(metrics[2]?.value || '0'),
        bounceRate: parseFloat(metrics[3]?.value || '0'),
        averageSessionDuration: parseFloat(metrics[4]?.value || '0')
      };
    } catch (error) {
      console.error('❌ Error fetching basic metrics:', error);
      throw error;
    }
  }

  /**
   * Fetch top pages
   */
  async getTopPages(startDate, endDate, limit = 5) {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{
          startDate,
          endDate
        }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit
      });

      return response.rows?.map(row => ({
        path: row.dimensionValues?.[0]?.value || 'Unknown',
        views: parseInt(row.metricValues?.[0]?.value || '0')
      })) || [];
    } catch (error) {
      console.error('❌ Error fetching top pages:', error);
      return [];
    }
  }

  /**
   * Fetch traffic sources
   */
  async getTrafficSources(startDate, endDate) {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{
          startDate,
          endDate
        }],
        dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
      });

      const totalSessions = response.rows?.reduce((sum, row) => 
        sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

      return response.rows?.map(row => ({
        source: row.dimensionValues?.[0]?.value || 'Unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0'),
        percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
      })) || [];
    } catch (error) {
      console.error('❌ Error fetching traffic sources:', error);
      return [];
    }
  }

  /**
   * Fetch top countries
   */
  async getTopCountries(startDate, endDate, limit = 5) {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{
          startDate,
          endDate
        }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit
      });

      const totalSessions = response.rows?.reduce((sum, row) => 
        sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

      return response.rows?.map(row => ({
        country: row.dimensionValues?.[0]?.value || 'Unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0'),
        percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
      })) || [];
    } catch (error) {
      console.error('❌ Error fetching top countries:', error);
      return [];
    }
  }

  /**
   * Fetch device breakdown
   */
  async getDeviceBreakdown(startDate, endDate) {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    try {
      const [response] = await this.client.runReport({
        property: `properties/${this.propertyId}`,
        dateRanges: [{
          startDate,
          endDate
        }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }]
      });

      const totalSessions = response.rows?.reduce((sum, row) => 
        sum + parseInt(row.metricValues?.[0]?.value || '0'), 0) || 1;

      return response.rows?.map(row => ({
        device: row.dimensionValues?.[0]?.value || 'Unknown',
        sessions: parseInt(row.metricValues?.[0]?.value || '0'),
        percentage: Math.round((parseInt(row.metricValues?.[0]?.value || '0') / totalSessions) * 100)
      })) || [];
    } catch (error) {
      console.error('❌ Error fetching device breakdown:', error);
      return [];
    }
  }

  /**
   * Get comprehensive weekly report
   */
  async getWeeklyReport() {
    if (!this.isEnabled) {
      throw new Error('Google Analytics not configured');
    }

    const dateRange = this.getDateRange();
    console.log('📊 Fetching weekly analytics report...');
    console.log(`📅 Current week: ${dateRange.currentWeek.startDate} to ${dateRange.currentWeek.endDate}`);
    console.log(`📅 Previous week: ${dateRange.previousWeek.startDate} to ${dateRange.previousWeek.endDate}`);

    try {
      // Fetch current week data
      const [currentMetrics, topPages, trafficSources, topCountries, deviceBreakdown] = await Promise.all([
        this.getBasicMetrics(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
        this.getTopPages(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
        this.getTrafficSources(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
        this.getTopCountries(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate),
        this.getDeviceBreakdown(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate)
      ]);

      // Fetch previous week data for comparison
      const previousMetrics = await this.getBasicMetrics(dateRange.previousWeek.startDate, dateRange.previousWeek.endDate);

      // Calculate percentage changes
      const calculateChange = (current, previous) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };

      return {
        currentWeek: currentMetrics,
        previousWeek: previousMetrics,
        changes: {
          sessions: calculateChange(currentMetrics.sessions, previousMetrics.sessions),
          totalUsers: calculateChange(currentMetrics.totalUsers, previousMetrics.totalUsers),
          screenPageViews: calculateChange(currentMetrics.screenPageViews, previousMetrics.screenPageViews),
          bounceRate: calculateChange(currentMetrics.bounceRate, previousMetrics.bounceRate)
        },
        topPages,
        trafficSources,
        topCountries,
        deviceBreakdown,
        dateRange
      };
    } catch (error) {
      console.error('❌ Error generating weekly report:', error);
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    if (!this.isEnabled) {
      console.log('⚠️ Google Analytics not configured');
      return false;
    }

    try {
      const dateRange = this.getDateRange();
      await this.getBasicMetrics(dateRange.currentWeek.startDate, dateRange.currentWeek.endDate);
      console.log('✅ Google Analytics connection successful');
      return true;
    } catch (error) {
      console.error('❌ Google Analytics connection failed:', error.message);
      return false;
    }
  }
}

export default GoogleAnalyticsClient;
