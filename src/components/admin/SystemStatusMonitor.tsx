import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';

type ServiceStatus = 'operational' | 'degraded' | 'down';

interface Service {
  name: string;
  status: ServiceStatus;
  lastChecked: string;
}

export const SystemStatusMonitor: React.FC = () => {
  const [services, setServices] = useState<Service[]>([
    { name: 'Razorpay API', status: 'operational', lastChecked: 'Just now' },
    { name: 'Firebase Connection', status: 'operational', lastChecked: 'Just now' },
    { name: 'Courier Sync', status: 'operational', lastChecked: 'Just now' },
  ]);

  const checkStatus = () => {
    // In a real app, this would ping backend endpoints.
    // Simulating updates.
    setServices((prev) => 
      prev.map(s => ({
        ...s,
        lastChecked: 'Just now',
        status: Math.random() > 0.95 ? 'degraded' : 'operational'
      }))
    );
  };

  useEffect(() => {
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-[#FAF7F2] p-5 sm:p-6 rounded-2xl border border-rose-100 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-lg font-bold text-gray-900 flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#211C1A]" />
          System Status
        </h3>
        <button onClick={checkStatus} className="text-gray-500 hover:text-[#211C1A] cursor-pointer">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="flex items-center justify-between p-3 bg-white rounded-xl border border-rose-50">
            <span className="text-sm font-semibold text-gray-700">{service.name}</span>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                service.status === 'operational' ? 'bg-emerald-100 text-emerald-800' : 
                service.status === 'degraded' ? 'bg-amber-100 text-black' : 'bg-rose-100 text-rose-800'
              }`}>
                {service.status.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-400">{service.lastChecked}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
