module Plankton

  class GotoInstruction < Instruction

    attr_reader :destination

    def initialize options = {}
      super 'goto', options
    end

    def mark_destination dest
      @destination = dest
    end

    def set_pc scope
      return @destination
    end

    def adjust_offset o
      super o
      @destination += o
    end

    def html
      "goto #{@destination}"
    end

  end

end
