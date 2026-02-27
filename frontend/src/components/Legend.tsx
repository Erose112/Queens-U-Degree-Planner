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
    </div>
  );
};