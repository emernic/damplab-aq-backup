module Plankton

  class PopInstruction < Instruction

    def initialize options = {}
      super 'pop', options
    end

    def bt_execute scope, params
      scope.pop
    end

  end

end
