// src/hooks/useTEAP.js
import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

export function useTEAP() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const createScenario = useCallback(async (name, description) => {
    setLoading(true);
    try {
      const response = await axios.post(`${API_BASE_URL}/scenarios/`, {
        name,
        description
      });
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const uploadScreenshot = useCallback(async (scenarioId, stepId, file) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('scenario_id', scenarioId);
      formData.append('step_id', stepId);
      formData.append('file', file);

      const response = await axios.post(
        `${API_BASE_URL}/evidence/upload-screenshot/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getScenarioEvidence = useCallback(async (scenarioId) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/evidence/scenario/${scenarioId}`
      );
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createScenario,
    uploadScreenshot,
    getScenarioEvidence
  };
}