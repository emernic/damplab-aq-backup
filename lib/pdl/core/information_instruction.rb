class InformationInstruction < Instruction

  attr_reader :content

  def initialize content, options = {}

    super 'information', options
    @content = content
    @renderable = true

  end

  # RAILS ###########################################################################################

  def pre_render scope, params
    begin
      @content = scope.substitute @content
    rescue Exception => e
      raise "Information error: Could not perform substitution on " + @content + ': ' + e.message
    end
  end

  def html
    "<b>information</b>"
  end

  # TERMINAL ########################################################################################

  def render scope
    puts "Protocol Information"
    puts scope.substitute content
    print "\nPress [ENTER] to continue: "
  end

  def execute scope
    gets
  end

end


