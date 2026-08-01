// src/components/ScenarioViewer.jsx
import React, { useState, useEffect } from 'react';
import { useTEAP } from '../hooks/useTEAP';
import { Camera, Database, CheckCircle } from 'lucide-react';

export function ScenarioViewer({ scenarioId }) {
  const { getScenarioEvidence } = useTEAP();
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getScenarioEvidence(scenarioId)
      .then(data => {
        setEvidence(data.evidence);
        setLoading(false);
      });
  }, [scenarioId]);

  if (loading) return <div className="text-center py-8">Loading evidence...</div>;

  return (
    <div className="space-y-4">
      {evidence && Object.entries(evidence).map(([type, items]) => (
        <div key={type} className="border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            {type === 'screenshot' && <Camera className="w-5 h-5" />}
            {type === 'db_query' && <Database className="w-5 h-5" />}
            <span className="font-semibold capitalize">{type}</span>
            <span className="text-gray-600 ml-auto">{items.length} items</span>
          </div>
          
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="bg-gray-50 p-3 rounded text-sm">
                <p className="text-gray-700">Step {item.step_id}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}