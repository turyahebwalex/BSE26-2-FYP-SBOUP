import React, { useState, useEffect } from 'react';
import {
  FiFlag,
  FiAlertTriangle,
  FiMail,
  FiXCircle,
  FiAward,
  FiCreditCard,
  FiMoreHorizontal,
  FiCheckCircle,
  FiChevronRight,
} from 'react-icons/fi';
import { reportAPI } from '../services/api';

const REASONS = [
  { value: 'fraudulent_scam', label: 'Fraudulent / Scam', icon: FiAlertTriangle },
  { value: 'spam', label: 'Spam', icon: FiMail },
  { value: 'inappropriate_content', label: 'Inappropriate Content', icon: FiXCircle },
  { value: 'fake_credentials', label: 'Fake Credentials', icon: FiAward },
  { value: 'payment_request', label: 'Requests Payment', icon: FiCreditCard },
  { value: 'other', label: 'Other', icon: FiMoreHorizontal },
];

const ReportBottomSheet = ({
  visible,
  onClose,
  targetId,
  targetType,
  targetLabel = 'this content',
}) => {
  const [stage, setStage] = useState('select');
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setStage('select');
      setReason(null);
      setDetails('');
      setError(null);
    }
  }, [visible]);

  if (!visible) return null;

  const handleClose = () => onClose();
  const handleSelectReason = (value) => {
    setReason(value);
    setStage('detail');
  };

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await reportAPI.create({
        targetId,
        targetType,
        reason,
        details: details.trim() || undefined,
      });
      setStage('success');
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedReason = REASONS.find((r) => r.value === reason);
  const ReasonIcon = selectedReason?.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl p-6 pb-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="w-12 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        {stage === 'select' && (
          <>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-500">
                <FiFlag className="w-4 h-4" />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Report {targetLabel}</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Why are you reporting this? Your report is anonymous.
            </p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {REASONS.map((r) => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.value}
                    onClick={() => handleSelectReason(r.value)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition border-b border-gray-100 last:border-0 text-left"
                  >
                    <span className="text-red-500">
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{r.label}</p>
                    </div>
                    <FiChevronRight className="text-gray-300 w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {stage === 'detail' && (
          <>
            <button
              onClick={() => {
                setStage('select');
                setError(null);
              }}
              className="mb-2 text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              ← Back
            </button>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-600 text-sm rounded-full mb-2">
              {ReasonIcon && <ReasonIcon className="w-3.5 h-3.5" />}
              {selectedReason?.label}
            </span>
            <h2 className="text-xl font-bold text-gray-800">Add details</h2>
            <p className="text-sm text-gray-500 mb-3">
              Optional but helps us investigate faster.
            </p>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-400 focus:border-orange-400 outline-none transition min-h-[100px] resize-y bg-gray-50"
              placeholder="Describe the issue…"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={2000}
            />
            <div className="text-right text-xs text-gray-400 mt-1">
              {details.length} / 2000
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl my-2 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition
                ${submitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {submitting ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <FiFlag className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>

            <button
              onClick={handleClose}
              className="w-full mt-2 py-2 text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </>
        )}

        {stage === 'success' && (
          <div className="flex flex-col items-center text-center py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-500 mb-4">
              <FiCheckCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Report Submitted</h2>
            <p className="text-sm text-gray-500 mt-2 max-w-xs">
              Thank you – our team will review {targetLabel} and take appropriate action.
            </p>
            <button
              onClick={handleClose}
              className="mt-6 px-8 py-2.5 bg-gray-800 text-white font-medium rounded-xl hover:bg-gray-700 transition"
            >
              Done
            </button>
          </div>
        )}

        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .animate-slide-up { animation: slideUp 0.25s ease-out; }
        `}</style>
      </div>
    </div>
  );
};

export default ReportBottomSheet;