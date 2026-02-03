// src/components/course-plan/Legend.tsx

/**
 * Legend for the course plan.
 * @returns A legend for the course plan.
 * Potentially not necessary if the graph is a static image.
 */
export const Legend = () => {
  return (
    <div className="bg-white border-2 border-gray-300 rounded-lg p-3 shadow-md text-xs">
      <h3 className="font-bold text-sm mb-2 text-gray-800">Legend</h3>
      
      {/* Course Statuses */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-6 bg-blue-600 border-2 border-blue-700 rounded text-white text-[10px] flex items-center justify-center font-bold">
            REQ
          </div>
          <span className="text-gray-700">Required</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-16 h-6 bg-orange-500 border-2 border-orange-600 rounded text-white text-[10px] flex items-center justify-center font-bold">
            CHOICE
          </div>
          <span className="text-gray-700">Choice</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="w-16 h-6 bg-green-600 border-2 border-green-700 rounded text-white text-[10px] flex items-center justify-center font-bold">
            DONE
          </div>
          <span className="text-gray-700">Completed</span>
        </div>
      </div>

      {/* Connection Types */}
      <div className="space-y-1.5 border-t pt-2">
        <div className="flex items-center gap-2">
          <svg width="30" height="12">
            <line x1="0" y1="6" x2="30" y2="6" stroke="#3b82f6" strokeWidth="2" />
            <polygon points="25,3 30,6 25,9" fill="#3b82f6" />
          </svg>
          <span className="text-gray-700">Prerequisite</span>
        </div>
        
        <div className="flex items-center gap-2">
          <svg width="30" height="12">
            <line x1="0" y1="6" x2="30" y2="6" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="5,5" />
          </svg>
          <span className="text-gray-700">Corequisite</span>
        </div>
        
        <div className="flex items-center gap-2">
          <svg width="30" height="12">
            <line x1="0" y1="6" x2="30" y2="6" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="3,3" />
          </svg>
          <span className="text-gray-700">Recommended</span>
        </div>
      </div>
    </div>
  );
};